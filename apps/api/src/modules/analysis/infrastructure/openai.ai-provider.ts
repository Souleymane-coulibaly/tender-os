import { z } from "zod";
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
 *  cette liste (dont `"free_text"`, la quasi-totalité des types de génération de contenu, module
 *  `generation`) retombe EXACTEMENT sur l'ancien comportement `json_object`, jamais une déduction
 *  automatique. Mission — "ne jamais activer le mode strict par défaut". */
function buildResponseFormat(responseSchemaName: string): Record<string, unknown> {
  const strictSchema = STRICT_OUTPUT_SCHEMAS[responseSchemaName];
  if (!strictSchema) {
    return { type: "json_object" };
  }
  return { type: "json_schema", json_schema: { name: responseSchemaName, strict: true, schema: strictSchema } };
}

/**
 * Seul adapter réel de cette tranche (mission §"Un seul adapter réel suffit") — choisi car c'est le
 * fournisseur le plus simple à intégrer sans dépendance supplémentaire : appel HTTP direct via
 * `fetch` (disponible nativement depuis Node 20, déjà la version cible de TenderOS), jamais le SDK
 * officiel `openai` (évite une dépendance supplémentaire pour un socle qui ne produit encore aucune
 * analyse métier réelle). Anthropic/Mistral/Azure OpenAI restent des extensions futures
 * documentées (voir `AIProviderRegistry`), jamais implémentées ici.
 */
export class OpenAiProvider implements AIProvider {
  readonly name = AnalysisProvider.OpenAi;

  constructor(private readonly apiKey: string) {}

  async complete(request: AIProviderRequest): Promise<AIProviderResult> {
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: request.model,
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: request.userPrompt },
          ],
          ...(request.maxOutputTokens ? { max_tokens: request.maxOutputTokens } : {}),
          ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
          response_format: buildResponseFormat(request.responseSchemaName),
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
    if (response.status >= 500) {
      throw new AiProviderUnavailableError({ reason: `AI provider returned HTTP ${response.status}` });
    }
    if (!response.ok) {
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
