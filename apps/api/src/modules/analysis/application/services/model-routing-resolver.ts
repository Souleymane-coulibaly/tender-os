import { AnalysisScope } from "../../domain/analysis-scope";
import type { EscalationCondition } from "../../domain/escalation-condition";
import type { AnalysisConfig } from "../../infrastructure/analysis-config";
import { PromptKey } from "../ports/prompt-template.port";
import type { ActiveRoutingDecision, RoutingPolicyResolver } from "../ports/routing-policy-resolver";

export function mapScopeToPromptKey(scope: AnalysisScope): PromptKey {
  return scope === AnalysisScope.Document ? PromptKey.AnalyzeDocument : PromptKey.ConsolidateTenderAnalysis;
}

export type ResolvedModelForAnalysis = Readonly<{
  /** Défini uniquement quand une RoutingPolicy a réellement fourni la décision — `undefined` =
   *  chemin legacy (résolution par `AIProviderRegistry.resolve()` sans sélecteur, comportement
   *  Sprint 4.1/4.2 inchangé). */
  provider?: string | undefined;
  model: string;
  routingPolicyId?: string | undefined;
  routingPolicyVersion?: number | undefined;
  escalationModel?: { provider: string; modelKey: string } | undefined;
  escalationConditions: readonly EscalationCondition[];
}>;

/**
 * Résout le modèle pour CE job (Sprint 5.2 §"Intégration Analysis") — d'abord via une
 * RoutingPolicy active si un résolveur est câblé, sinon repli STRICT sur le comportement Sprint
 * 4.1/4.2 (variable d'environnement statique par scope). Toute erreur du résolveur de routing est
 * traitée comme "pas de policy" : jamais une cause d'échec de l'analyse elle-même (mission
 * §"l'absence de routing ne doit jamais casser Analysis").
 */
export async function resolveModelForAnalysis(input: {
  scope: AnalysisScope;
  organizationId: string;
  config: AnalysisConfig;
  routingPolicyResolver?: RoutingPolicyResolver | undefined;
  onRoutingResolutionError?: (error: unknown) => void;
}): Promise<ResolvedModelForAnalysis> {
  const legacyModel =
    input.scope === AnalysisScope.Document ? input.config.aiModelForDocumentAnalysis : input.config.aiModelForTenderConsolidation;
  const legacy: ResolvedModelForAnalysis = { model: legacyModel, escalationConditions: [] };

  if (!input.routingPolicyResolver) {
    return legacy;
  }

  let decision: ActiveRoutingDecision | null;
  try {
    decision = await input.routingPolicyResolver.resolveActive({
      organizationId: input.organizationId,
      promptKey: mapScopeToPromptKey(input.scope),
    });
  } catch (error) {
    input.onRoutingResolutionError?.(error);
    return legacy;
  }

  if (!decision) {
    return legacy;
  }

  return {
    provider: decision.primaryModel.provider,
    model: decision.primaryModel.modelKey,
    routingPolicyId: decision.policyId,
    routingPolicyVersion: decision.policyVersion,
    escalationModel: decision.escalationModel,
    escalationConditions: decision.escalationConditions,
  };
}
