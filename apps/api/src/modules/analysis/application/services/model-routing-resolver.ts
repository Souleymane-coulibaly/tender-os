import type { AiModelRouter } from "../../../ai-routing";
import type { AiTaskType } from "../../../../shared-kernel/ai-task-type";
import { AnalysisScope } from "../../domain/analysis-scope";
import { AiModelRouterUnavailableError } from "../../domain/errors";
import { PromptKey } from "../ports/prompt-template.port";

export function mapScopeToPromptKey(scope: AnalysisScope): PromptKey {
  return scope === AnalysisScope.Document ? PromptKey.AnalyzeDocument : PromptKey.ConsolidateTenderAnalysis;
}

export type ResolvedModelForAnalysis = Readonly<{ provider: string; model: string }>;

/**
 * Checkpoint TENDEROS-2.1-P2.3-E4.1 — `AiModelRouter` est la SEULE autorité de sélection du modèle
 * (mission "aucun use case métier live ne doit décider lui-même quel modèle utiliser"). Remplace le
 * palier `RoutingPolicy` (Sprint 5.2) et le repli statique `AnalysisConfig.aiModelForXxx` (Sprint
 * 4.1/4.2), tous deux retirés du chemin runtime — jamais un modèle codé en dur, jamais une policy
 * qui court-circuite le Router.
 *
 * L'escalade vers un second modèle sur échec (Sprint 5.2 §"Fallback simple") disparaît avec ce
 * palier : elle dépendait ENTIÈREMENT d'une `RoutingPolicy.escalationModel`, elle-même retirée du
 * chemin runtime — il n'existe plus de second modèle à escalader vers. Le retry réseau borné
 * existant (`AnalysisConfig.aiMaxRetries`, inchangé) reste l'unique mécanisme de résilience.
 *
 * Aucun `userId` n'est transmis ici : `AnalysisJob` ne trace qu'un `triggeredByRole`, jamais un
 * `triggeredByUserId` (job asynchrone, voir le rapport final "AUTH_ACTOR_AUDIT") — la résolution
 * reste donc TOUJOURS `DEFAULT` pour Analysis, jamais un override utilisateur, un fait
 * architectural jamais contourné ici.
 *
 * Mission §17 — un Router indisponible (`AiRoutingModule` non câblé, jamais le cas en production)
 * échoue PROPREMENT (`AiModelRouterUnavailableError`), jamais un repli silencieux.
 */
export async function resolveModelForAnalysis(input: { scope: AnalysisScope; organizationId: string; aiModelRouter?: AiModelRouter | undefined }): Promise<ResolvedModelForAnalysis> {
  if (!input.aiModelRouter) {
    throw new AiModelRouterUnavailableError();
  }
  const routed = await input.aiModelRouter.resolve({ taskType: mapScopeToPromptKey(input.scope) as AiTaskType, organizationId: input.organizationId });
  return { provider: routed.provider, model: routed.modelKey };
}
