import type { BusinessAnalysisRepository } from "../ports/business-analysis.repository";

/**
 * Résout la version d'analyse à consulter pour un tender (mission Sprint 4.2 §"GET .../risques,
 * .../critères, ...") — réutilisée par toutes les listes de findings pour ne jamais dupliquer cette
 * logique : si l'appelant précise `analysisVersion`, elle est utilisée telle quelle (consultation
 * explicite de l'historique) ; sinon la plus récente consolidation réussie est résolue via
 * `TenderAnalysisSummary` (voir `BusinessAnalysisRepository.getLatestSummary`). Retourne `undefined`
 * si aucune consolidation n'a encore jamais réussi ET qu'aucune version explicite n'a été demandée —
 * jamais une erreur ici : c'est à l'appelant de décider si une liste vide est une réponse valide.
 */
export async function resolveLatestAnalysisVersion(
  repository: BusinessAnalysisRepository,
  input: { organizationId: string; tenderId: string; requestedVersion?: number | undefined },
): Promise<number | undefined> {
  if (input.requestedVersion !== undefined) {
    return input.requestedVersion;
  }
  const summary = await repository.getLatestSummary({ organizationId: input.organizationId, tenderId: input.tenderId });
  return summary?.analysisVersion;
}
