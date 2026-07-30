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

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

const OpenAiChatCompletionSchema = z.object({
  id: z.string().optional(),
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

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
          response_format: { type: "json_object" },
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
