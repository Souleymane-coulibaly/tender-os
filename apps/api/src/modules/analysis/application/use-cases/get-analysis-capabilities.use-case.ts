import { Inject, Injectable } from "@nestjs/common";
import { GetTenderUseCase } from "../../../tenders";
import { AnalysisPermission } from "../../domain/analysis-permission";
import { AiProviderNotConfiguredError } from "../../domain/errors";
import { assertHasAnalysisPermission } from "../policies/analysis-authorization.policy";
import { AI_PROVIDER_REGISTRY, type AIProviderRegistry } from "../ports/ai-provider-registry";
import { PromptKey } from "../ports/prompt-template.port";

export type GetAnalysisCapabilitiesQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
}>;

export type AnalysisCapabilityReasonCode = "AI_PROVIDER_NOT_CONFIGURED";

export type AnalysisCapability = Readonly<{
  taskType: typeof PromptKey.AnalyzeDocument | typeof PromptKey.ConsolidateTenderAnalysis;
  ready: boolean;
  reasonCode?: AnalysisCapabilityReasonCode;
}>;

/**
 * Capacités d'analyse IA réellement configurées (mission Sprint 8A.2 — mirroir de
 * `GetGenerationCapabilitiesUseCase`, module `generation`). Contrairement à Generation, Analysis
 * n'a ni `PromptTemplate` ni `RoutingPolicy` bloquants en base : les deux prompts métier sont
 * statiques dans le code (voir `StaticPromptTemplateProvider`), et une `RoutingPolicy`
 * absente/en échec de résolution retombe SILENCIEUSEMENT sur la configuration statique (voir
 * `ProcessAnalysisJobUseCase`, "falling back to the static model configuration"), jamais un
 * blocage. Le SEUL vrai blocage possible est l'absence de provider IA configuré — vérifié en
 * réutilisant le MÊME registre que `ProcessAnalysisJobUseCase`/`ProcessDocumentExtractionUseCase`,
 * jamais un second calcul divergent de "l'IA est-elle configurée" (même discipline que la décision
 * d'architecture Sprint 8A.2 pour `GetGenerationCapabilitiesUseCase` : pas de réouverture du cœur
 * typé d'ai-benchmark).
 */
@Injectable()
export class GetAnalysisCapabilitiesUseCase {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    @Inject(AI_PROVIDER_REGISTRY) private readonly aiProviderRegistry: AIProviderRegistry,
  ) {}

  async execute(query: GetAnalysisCapabilitiesQuery): Promise<readonly AnalysisCapability[]> {
    assertHasAnalysisPermission(query.actorRole, AnalysisPermission.Read);

    await this.getTenderUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorRole: query.actorRole,
      actorId: query.actorId,
    });

    const outcome = this.resolveOutcome();
    return [
      { taskType: PromptKey.AnalyzeDocument, ...outcome },
      { taskType: PromptKey.ConsolidateTenderAnalysis, ...outcome },
    ];
  }

  private resolveOutcome(): { ready: boolean; reasonCode?: AnalysisCapabilityReasonCode } {
    try {
      this.aiProviderRegistry.resolve();
      return { ready: true };
    } catch (error) {
      if (error instanceof AiProviderNotConfiguredError) {
        return { ready: false, reasonCode: "AI_PROVIDER_NOT_CONFIGURED" };
      }
      throw error;
    }
  }
}
