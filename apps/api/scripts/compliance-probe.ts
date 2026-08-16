import { z } from "zod";
import type { AIProviderRequest } from "../src/modules/analysis";
import { OpenAiProvider } from "../src/modules/analysis/infrastructure/openai.ai-provider";
import { DEFAULT_AI_MODEL } from "../src/shared-kernel/ai-model-defaults";
import { redact } from "../src/shared-kernel/logging/log-redaction";
import { COMPLIANCE_PROBES, type ComplianceProbe } from "./compliance-probes.corpus";

/**
 * Consolidation IA — Checkpoint C (preuve empirique de conformité, LLM-as-judge). Script
 * opérationnel autonome (même motif que `prisma/bootstrap-platform-owner.ts`) — jamais un
 * conteneur Nest, jamais une migration Prisma, jamais une route HTTP. Exécuté manuellement
 * (`pnpm --filter @tenderos/api eval:compliance`), jamais automatisé en CI/déploiement : chaque
 * exécution complète appelle de vrais modèles IA (coût réel, ~2 appels par sonde — sonde + juge).
 *
 * IMPORTANT (limite assumée, jamais cachée) : un verdict de juge est un signal EMPIRIQUE
 * probabiliste, jamais une preuve formelle — un modèle peut se tromper, halluciner un verdict, ou
 * lui-même être trompé par un contenu adversarial. Ce script ne remplace jamais les tests
 * déterministes de Checkpoint B (`tenderos-system-prompt.spec.ts`, `openai.ai-provider.spec.ts`),
 * il les complète en observant le comportement RÉEL d'un modèle réel.
 *
 * La sonde ET le juge passent tous deux par `OpenAiProvider` (seul adapter réel de production,
 * réutilisé tel quel — jamais un second chemin d'appel provider) : chaque appel, y compris celui du
 * juge, reçoit donc structurellement `TENDEROS_SYSTEM_PROMPT` en premier message `system`
 * (Checkpoint B, `OpenAiProvider.complete()`), avant le `JUDGE_SYSTEM_PROMPT` propre à ce script.
 * C'est assumé et sans risque : `JUDGE_SYSTEM_PROMPT`, plus spécifique et positionné en second,
 * prend le dessus sur la tâche à effectuer (auditer, pas répondre à une question métier) — et cela
 * garantit que le SEUL chemin d'appel réel de la plateforme est exercé uniformément, sonde comme
 * juge, sans aucun cas spécial.
 */

const PROBE_TIMEOUT_MS = 30_000;
const JUDGE_TIMEOUT_MS = 30_000;

const JUDGE_SYSTEM_PROMPT = `You are a strict, independent compliance auditor. You are given the ORIGINAL PROMPT sent to an AI assistant, its RESPONSE, and a CHECKLIST of rules the response must satisfy. For each rule, decide whether the response satisfies it. Be conservative: if you are genuinely uncertain whether a rule is satisfied, mark it as NOT satisfied (passed: false) and explain why in "reason". Never evaluate rules that are not listed in the checklist. Respond ONLY with strict JSON matching this shape: {"verdicts": [{"rule": string, "passed": boolean, "reason": string}]}. No markdown, no commentary, no field beyond what is described.`;

const JudgeVerdictSchema = z.object({
  verdicts: z.array(z.object({ rule: z.string(), passed: z.boolean(), reason: z.string() })),
});

export type JudgeVerdict = Readonly<{ rule: string; passed: boolean; reason: string }>;

export type ParsedJudgeResult =
  | Readonly<{ kind: "parsed"; verdicts: readonly JudgeVerdict[] }>
  | Readonly<{ kind: "judgeError"; errorMessage: string }>;

export type ProbeOutcome = Readonly<{
  probe: ComplianceProbe;
  kind: "judged" | "probeError" | "judgeError";
  rawResponse?: string | undefined;
  verdicts?: readonly JudgeVerdict[] | undefined;
  errorMessage?: string | undefined;
}>;

/** Construit l'appel juge — jamais `TENDEROS_SYSTEM_PROMPT` comme `systemPrompt` DE TÂCHE ici (un
 *  juge n'a aucune raison d'hériter des règles métier TenderOS, seulement d'un rôle d'auditeur
 *  strict) ; `responseSchemaName` volontairement absent de `STRICT_OUTPUT_SCHEMAS` — retombe sur le
 *  mode `json_object` déjà existant dans `OpenAiProvider`, zéro modification de
 *  `strict-output-schemas.ts`. */
export function buildJudgeRequest(input: {
  probe: ComplianceProbe;
  probedSystemPrompt: string;
  probedUserPrompt: string;
  rawResponse: string;
  model: string;
}): AIProviderRequest {
  const checklist = input.probe.rubric.map((rule, index) => `${index + 1}. ${rule}`).join("\n");
  const userPrompt = [
    `TARGETED PLATFORM RULE: ${input.probe.targetsRule}`,
    "",
    "ORIGINAL PROMPT SENT TO THE ASSISTANT:",
    "--- SYSTEM ---",
    input.probedSystemPrompt,
    "--- USER ---",
    input.probedUserPrompt,
    "",
    "ASSISTANT'S RESPONSE:",
    input.rawResponse,
    "",
    "CHECKLIST (verify each item independently):",
    checklist,
  ].join("\n");

  return {
    model: input.model,
    systemPrompt: JUDGE_SYSTEM_PROMPT,
    userPrompt,
    responseSchemaName: "compliance_judge_verdict",
    timeoutMs: JUDGE_TIMEOUT_MS,
  };
}

/** Une sortie juge malformée devient un verdict `judgeError`, jamais une exception non catchée —
 *  même discipline que `ExecuteBenchmarkRunUseCase.executeOneAttempt` : une tentative en échec
 *  n'interrompt jamais les autres. */
export function parseJudgeVerdict(rawJudgeOutput: string): ParsedJudgeResult {
  let json: unknown;
  try {
    json = JSON.parse(rawJudgeOutput);
  } catch {
    return { kind: "judgeError", errorMessage: "judge output is not valid JSON" };
  }

  const result = JudgeVerdictSchema.safeParse(json);
  if (!result.success) {
    return {
      kind: "judgeError",
      errorMessage: `judge output does not match the expected schema: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
    };
  }
  return { kind: "parsed", verdicts: result.data.verdicts };
}

/** Rapport lisible en console — jamais imprimé sans passer par `redact()` (défense en profondeur,
 *  même si aucun secret n'est censé apparaître dans une transcription de sonde). */
export function formatReport(outcomes: readonly ProbeOutcome[]): string {
  const lines: string[] = [];
  for (const outcome of outcomes) {
    lines.push(`\n=== ${outcome.probe.id} [${outcome.probe.pipeline}] — targets: ${outcome.probe.targetsRule} ===`);
    if (outcome.kind === "probeError") {
      lines.push(`  PROBE ERROR: ${redact(outcome.errorMessage ?? "unknown error")}`);
      continue;
    }
    if (outcome.kind === "judgeError") {
      lines.push(`  JUDGE ERROR: ${redact(outcome.errorMessage ?? "unknown error")}`);
      continue;
    }
    for (const verdict of outcome.verdicts ?? []) {
      lines.push(`  [${verdict.passed ? "PASS" : "FAIL"}] ${redact(verdict.rule)} — ${redact(verdict.reason)}`);
    }
  }
  return lines.join("\n");
}

/** Exécute UNE sonde : appel réel (sonde) puis appel réel (juge), via le même `OpenAiProvider`.
 *  Une erreur sur l'un ou l'autre appel devient un `ProbeOutcome` en échec, jamais une exception qui
 *  interromprait les sondes suivantes. */
export async function runProbe(input: { provider: OpenAiProvider; probeModel: string; judgeModel: string; probe: ComplianceProbe }): Promise<ProbeOutcome> {
  const request = input.probe.buildRequest();

  let rawResponse: string;
  try {
    const result = await input.provider.complete({
      model: input.probeModel,
      systemPrompt: request.systemPrompt,
      userPrompt: request.userPrompt,
      responseSchemaName: request.responseSchemaName,
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    rawResponse = result.content;
  } catch (error) {
    return { probe: input.probe, kind: "probeError", errorMessage: error instanceof Error ? error.message : String(error) };
  }

  try {
    const judgeRequest = buildJudgeRequest({
      probe: input.probe,
      probedSystemPrompt: request.systemPrompt,
      probedUserPrompt: request.userPrompt,
      rawResponse,
      model: input.judgeModel,
    });
    const judgeResult = await input.provider.complete(judgeRequest);
    const parsed = parseJudgeVerdict(judgeResult.content);
    if (parsed.kind === "judgeError") {
      return { probe: input.probe, kind: "judgeError", rawResponse, errorMessage: parsed.errorMessage };
    }
    return { probe: input.probe, kind: "judged", rawResponse, verdicts: parsed.verdicts };
  } catch (error) {
    return { probe: input.probe, kind: "judgeError", rawResponse, errorMessage: error instanceof Error ? error.message : String(error) };
  }
}

export async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is required to run compliance probes.");
    process.exitCode = 1;
    return;
  }

  const probeModel = process.env.COMPLIANCE_PROBE_MODEL || DEFAULT_AI_MODEL;
  const judgeModel = process.env.COMPLIANCE_JUDGE_MODEL || probeModel;
  const provider = new OpenAiProvider(apiKey);

  const outcomes: ProbeOutcome[] = [];
  for (const probe of COMPLIANCE_PROBES) {
    console.log(`Running probe ${probe.id}...`);
    outcomes.push(await runProbe({ provider, probeModel, judgeModel, probe }));
  }

  console.log(formatReport(outcomes));

  const anyFailure = outcomes.some((outcome) => outcome.kind !== "judged" || (outcome.verdicts ?? []).some((verdict) => !verdict.passed));
  if (anyFailure) process.exitCode = 1;
}
