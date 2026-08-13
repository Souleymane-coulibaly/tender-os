import { Inject, Injectable } from "@nestjs/common";
import { aiRequestsTotal } from "../../../shared-kernel/metrics/metrics";
import { AnalysisProvider } from "../domain/analysis-provider";
import { AiProviderNotConfiguredError } from "../domain/errors";
import type { AIProvider, AIProviderRequest, AIProviderResult } from "../application/ports/ai-provider";
import type { AIProviderRegistry, AIProviderSelector } from "../application/ports/ai-provider-registry";
import { ANALYSIS_CONFIG, type AnalysisConfig } from "./analysis-config";
import { OpenAiProvider } from "./openai.ai-provider";

/**
 * Sprint 21 (hardening) — mission §57 (ai_requests_total). Décore le provider RÉSOLU plutôt que de
 * modifier `OpenAiProvider` lui-même : un seul point d'instrumentation couvre déjà tous les appelants
 * (Analysis, Generation, Chat, ai-suggestion...) qui passent tous par `AIProviderRegistry.resolve()`,
 * et couvrira automatiquement tout futur adapter réel (Anthropic/Mistral/Azure) sans modification.
 * Jamais le contenu du prompt/de la réponse dans la métrique — seulement provider + issue.
 */
class MetricsRecordingAIProvider implements AIProvider {
  readonly name: string;

  constructor(private readonly delegate: AIProvider) {
    this.name = delegate.name;
  }

  async complete(request: AIProviderRequest): Promise<AIProviderResult> {
    try {
      const result = await this.delegate.complete(request);
      aiRequestsTotal.inc({ provider: this.name, outcome: "succeeded" });
      return result;
    } catch (error) {
      aiRequestsTotal.inc({ provider: this.name, outcome: "failed" });
      throw error;
    }
  }
}

/**
 * Résolution centralisée du provider IA configuré (mission §"Factory et résolution") — évite les
 * conditions dispersées dans le code : c'est le SEUL endroit du module qui connaît la liste des
 * providers réellement câblés. Résolution PARESSEUSE (appelée uniquement par
 * `ProcessAnalysisJobUseCase`, jamais à l'instanciation du module) : une configuration IA absente
 * ou un provider non enregistré ne font jamais échouer le démarrage de l'application, seulement le
 * traitement d'une analyse (`AI_PROVIDER_NOT_CONFIGURED`).
 */
@Injectable()
export class DefaultAIProviderRegistry implements AIProviderRegistry {
  constructor(@Inject(ANALYSIS_CONFIG) private readonly config: AnalysisConfig) {}

  resolve(selector?: AIProviderSelector): AIProvider {
    const provider = selector?.provider ?? this.config.aiProvider;
    if (!provider) {
      throw new AiProviderNotConfiguredError({ reason: "no AI_PROVIDER configured" });
    }

    switch (provider) {
      case AnalysisProvider.OpenAi: {
        if (!this.config.openAiApiKey) {
          throw new AiProviderNotConfiguredError({ reason: "OPENAI_API_KEY is not set" });
        }
        return new MetricsRecordingAIProvider(new OpenAiProvider(this.config.openAiApiKey));
      }
      // Extensions futures (mission §"préparer l'architecture pour permettre ultérieurement... sans
      // modifier le domaine") — aucun adapter réel dans cette tranche, jamais quatre adapters
      // complets pour un socle qui ne produit encore aucune analyse métier.
      case AnalysisProvider.Anthropic:
      case AnalysisProvider.Mistral:
      case AnalysisProvider.AzureOpenAi:
      default:
        throw new AiProviderNotConfiguredError({
          reason: `no adapter registered for provider "${provider}"`,
        });
    }
  }
}
