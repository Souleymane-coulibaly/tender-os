import { Inject, Injectable } from "@nestjs/common";
import { AnalysisProvider } from "../domain/analysis-provider";
import { AiProviderNotConfiguredError } from "../domain/errors";
import type { AIProvider } from "../application/ports/ai-provider";
import type { AIProviderRegistry } from "../application/ports/ai-provider-registry";
import { ANALYSIS_CONFIG, type AnalysisConfig } from "./analysis-config";
import { OpenAiProvider } from "./openai.ai-provider";

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

  resolve(): AIProvider {
    if (!this.config.aiProvider) {
      throw new AiProviderNotConfiguredError({ reason: "no AI_PROVIDER configured" });
    }

    switch (this.config.aiProvider) {
      case AnalysisProvider.OpenAi: {
        if (!this.config.openAiApiKey) {
          throw new AiProviderNotConfiguredError({ reason: "OPENAI_API_KEY is not set" });
        }
        return new OpenAiProvider(this.config.openAiApiKey);
      }
      // Extensions futures (mission §"préparer l'architecture pour permettre ultérieurement... sans
      // modifier le domaine") — aucun adapter réel dans cette tranche, jamais quatre adapters
      // complets pour un socle qui ne produit encore aucune analyse métier.
      case AnalysisProvider.Anthropic:
      case AnalysisProvider.Mistral:
      case AnalysisProvider.AzureOpenAi:
      default:
        throw new AiProviderNotConfiguredError({
          reason: `no adapter registered for provider "${this.config.aiProvider}"`,
        });
    }
  }
}
