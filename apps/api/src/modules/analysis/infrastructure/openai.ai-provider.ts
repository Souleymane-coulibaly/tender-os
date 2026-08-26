import { Logger } from "@nestjs/common";
import { z } from "zod";
import { TENDEROS_SYSTEM_PROMPT, TENDEROS_SYSTEM_PROMPT_VERSION } from "../../../shared-kernel/tenderos-system-prompt";
import { AnalysisProvider } from "../domain/analysis-provider";
import {
  AiAuthenticationFailedError,
  AiInvalidResponseError,
  AiProviderUnavailableError,
  AiRateLimitedError,
  AiTimeoutError,
} from "../domain/errors";
import type { AIProvider, AIProviderRequest, AIProviderResult } from "../application/ports/ai-provider";
import { STRICT_OUTPUT_SCHEMAS } from "./strict-output-schemas";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

/** `content` devient nullable et `refusal` apparaît UNIQUEMENT en mode Structured Outputs strict
 *  (mission — nouveau cas à gérer explicitement, jamais possible avec l'ancien mode `json_object`) :
 *  OpenAI peut refuser de produire le contenu demandé (cas limites de sécurité/contenu) plutôt que
 *  de violer le schéma — jamais traité comme une réponse silencieusement vide. */
const OpenAiChatCompletionSchema = z.object({
  id: z.string().optional(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable(), refusal: z.string().nullable().optional() }) })),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

/** Mode strict UNIQUEMENT pour les deux contrats connus de la liste blanche
 *  (`STRICT_OUTPUT_SCHEMAS`, `strict-output-schemas.ts`) — tout `responseSchemaName` absent de
 *  cette liste retombe sur l'ancien comportement `json_object`, jamais une déduction automatique.
 *  Mission — "ne jamais activer le mode strict par défaut".
 *
 *  Exception à ce fallback (correctif "messages must contain the word 'json' in some form, to use
 *  'response_format' of type 'json_object'" — échec HTTP 400 réel en prod sur "Synthèse
 *  exécutive") : `"free_text"` est le sentinel exclusif de `ProcessGenerationUseCase` pour un
 *  `PromptTemplate` en mode `outputMode: FREE_TEXT` (jamais utilisé pour une clé de schéma
 *  structuré réelle — voir `responseSchemaName: input.template.structuredSchemaKey ?? "free_text"`,
 *  process-generation.use-case.ts). OpenAI EXIGE que le mot "json" apparaisse dans les messages dès
 *  que `response_format` vaut `json_object` — une contrainte qu'un prompt de génération de texte
 *  libre (méthodologie, synthèse exécutive, reformulation...) n'a structurellement aucune raison de
 *  respecter, et ne doit pas avoir à respecter : ce n'est pas une sortie JSON qui est demandée.
 *  Aucun `response_format` n'est donc envoyé pour ce cas précis — jamais pour un autre nom
 *  non-blanchi (`structuredSchemaKey` réel côté generation, ou schéma futur d'ai-benchmark), dont le
 *  comportement `json_object` reste inchangé. */
function buildResponseFormat(responseSchemaName: string): Record<string, unknown> | undefined {
  const strictSchema = STRICT_OUTPUT_SCHEMAS[responseSchemaName];
  if (strictSchema) {
    return { type: "json_schema", json_schema: { name: responseSchemaName, strict: true, schema: strictSchema } };
  }
  if (responseSchemaName === "free_text") {
    return undefined;
  }
  return { type: "json_object" };
}

const PROVIDER_ERROR_DETAIL_MAX_CHARS = 300;

/** Mission — correctif "AI_INVALID_RESPONSE: AI provider returned HTTP 400" sans aucun détail
 *  exploitable : le corps de la réponse d'erreur d'OpenAI (`{"error":{"message":...}}`, décrivant
 *  TOUJOURS un problème de forme de LA REQUÊTE envoyée par TenderOS — jamais un contenu client,
 *  jamais un extrait du corpus analysé) était jusqu'ici entièrement ignoré. Lu une seule fois ici,
 *  jamais après un `response.json()` réussi déjà consommé ailleurs (branches mutuellement
 *  exclusives). Ne lève jamais elle-même — un corps d'erreur illisible ne doit jamais masquer
 *  l'erreur HTTP déjà identifiée. */
async function describeProviderErrorBody(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    if (!text) return undefined;
    const parsed: unknown = JSON.parse(text);
    const message = (parsed as { error?: { message?: unknown } } | null)?.error?.message;
    const detail = typeof message === "string" && message ? message : text;
    return detail.length > PROVIDER_ERROR_DETAIL_MAX_CHARS ? `${detail.slice(0, PROVIDER_ERROR_DETAIL_MAX_CHARS)}…` : detail;
  } catch {
    return undefined;
  }
}

/**
 * Seul adapter réel de cette tranche (mission §"Un seul adapter réel suffit") — choisi car c'est le
 * fournisseur le plus simple à intégrer sans dépendance supplémentaire : appel HTTP direct via
 * `fetch` (disponible nativement depuis Node 20, déjà la version cible de TenderOS), jamais le SDK
 * officiel `openai` (évite une dépendance supplémentaire pour un socle qui ne produit encore aucune
 * analyse métier réelle). Anthropic/Mistral/Azure OpenAI restent des extensions futures
 * documentées (voir `AIProviderRegistry`), jamais implémentées ici.
 *
 * Consolidation IA — Checkpoint B, correctifs audit Codex (P2) : (1) "séparation de rôle" — seul
 * adapter réel utilisé par les 4 pipelines (Chat/Mémoire technique/Analyse/Génération), c'est ICI,
 * et ICI SEULEMENT, que `TENDEROS_SYSTEM_PROMPT` est injecté comme son propre message
 * `{role: "system"}`, toujours en premier — jamais concaténé au prompt de tâche par un appelant
 * (voir `shared-kernel/tenderos-system-prompt.ts`). (2) "traçabilité incomplète" — chaque appel
 * réussi journalise `TENDEROS_SYSTEM_PROMPT_VERSION` (log structuré, aucune migration Prisma requise
 * — la version plateforme n'est pas propre à un tenant/enregistrement, un log suffit à l'audit).
 */
export class OpenAiProvider implements AIProvider {
  readonly name = AnalysisProvider.OpenAi;

  private readonly logger = new Logger(OpenAiProvider.name);

  constructor(private readonly apiKey: string) {}

  async complete(request: AIProviderRequest): Promise<AIProviderResult> {
    const startedAt = Date.now();
    const responseFormat = buildResponseFormat(request.responseSchemaName);
    let response: Response;
    try {
      response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: request.model,
          messages: [
            { role: "system", content: TENDEROS_SYSTEM_PROMPT },
            { role: "system", content: request.systemPrompt },
            { role: "user", content: request.userPrompt },
          ],
          ...(request.maxOutputTokens ? { max_tokens: request.maxOutputTokens } : {}),
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          ...(responseFormat ? { response_format: responseFormat } : {}),
        }),
        signal: AbortSignal.timeout(request.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new AiTimeoutError({ timeoutMs: request.timeoutMs });
      }
      // Jamais le message brut d'une erreur réseau (peut contenir des détails d'hôte/DNS) —
      // uniquement une raison générique sûre (mission §"Sécurité").
      throw new AiProviderUnavailableError({ reason: "network error while calling the AI provider" });
    }

    const durationMs = Date.now() - startedAt;

    if (response.status === 401 || response.status === 403) {
      throw new AiAuthenticationFailedError();
    }
    if (response.status === 429) {
      throw new AiRateLimitedError();
    }
    // Checkpoint TENDEROS-2.1-P2.3-E12 (P2, mission §53 "l'utilisateur ne doit pas recevoir
    // 'OpenAI 429...' brut") — `AI_PROVIDER_UNAVAILABLE`/`AI_INVALID_RESPONSE` sont mappés par
    // `analysis-error.filter.ts` et renvoient `exception.message` TEL QUEL au client : y interpoler
    // le corps d'erreur du fournisseur exposait à un utilisateur final des identifiants de modèle,
    // des identifiants d'organisation/projet OpenAI, l'état de quota et la forme de notre propre
    // payload. Le détail reste INTÉGRALEMENT disponible pour le diagnostic (journalisé ci-dessous,
    // passé par la redaction du logger structuré) ; seul le statut HTTP, non sensible, atteint le
    // client. Jamais une perte d'information d'exploitation, uniquement un arrêt de la fuite.
    if (response.status >= 500) {
      const detail = await describeProviderErrorBody(response);
      if (detail) this.logger.error(`AI provider returned HTTP ${response.status}: ${detail}`);
      throw new AiProviderUnavailableError({ reason: `AI provider returned HTTP ${response.status}` });
    }
    if (!response.ok) {
      const detail = await describeProviderErrorBody(response);
      if (detail) this.logger.error(`AI provider returned HTTP ${response.status}: ${detail}`);
      throw new AiInvalidResponseError({ reason: `AI provider returned HTTP ${response.status}` });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new AiInvalidResponseError({ reason: "response body is not valid JSON" });
    }

    const parsed = OpenAiChatCompletionSchema.safeParse(body);
    const choice = parsed.success ? parsed.data.choices[0] : undefined;
    if (!parsed.success || !choice) {
      throw new AiInvalidResponseError({ reason: "unexpected AI provider response shape" });
    }

    // Mode strict UNIQUEMENT (mission) — jamais atteignable en mode `json_object`, jamais un
    // contenu `null` silencieusement transformé en chaîne vide.
    if (choice.message.refusal) {
      throw new AiInvalidResponseError({ reason: "the model refused to produce a response matching the required schema" });
    }
    if (choice.message.content === null) {
      throw new AiInvalidResponseError({ reason: "response body has no content and no refusal" });
    }

    this.logger.log(
      `AI completion succeeded: model=${request.model}, platformSystemPromptVersion=${TENDEROS_SYSTEM_PROMPT_VERSION}, responseSchemaName=${request.responseSchemaName}, durationMs=${durationMs}, providerRequestId=${parsed.data.id ?? "n/a"}`,
    );

    return {
      content: choice.message.content,
      usage: {
        inputTokens: parsed.data.usage?.prompt_tokens ?? 0,
        outputTokens: parsed.data.usage?.completion_tokens ?? 0,
        totalTokens: parsed.data.usage?.total_tokens ?? 0,
      },
      durationMs,
      providerRequestId: parsed.data.id,
    };
  }
}
