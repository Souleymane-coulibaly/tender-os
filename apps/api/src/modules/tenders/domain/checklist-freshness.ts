/**
 * Checkpoint 2.1-P2.1-FIX-B — jamais persistée (même discipline que
 * `computeAnalysisFreshness`/`withGoNoGoCandidateStaleness`), calculée en LECTURE SEULE en
 * comparant `lastReconciledAnalysisVersion` (figé au dernier `ReconcileChecklistWithNewAnalysisUseCase`
 * réussi) à l'`analysisVersion` COURANTE. Distinct de `AnalysisFreshness` (mission §31 "si Analysis
 * est CURRENT mais Checklist pas encore réconciliée, ne pas la présenter silencieusement comme à
 * jour") : une Checklist peut être `RECONCILIATION_REQUIRED` même quand l'analyse elle-même est
 * `CURRENT`, si personne n'a encore relancé le reconcile depuis ce rafraîchissement. Volontairement
 * à seulement 2 valeurs (mission §27 "ne pas construire une grosse machine d'état sans besoin").
 *
 * Correctif audit P1-FIXB-001 — l'inverse (l'analyse la plus récente réconciliée est elle-même
 * STALE vis-à-vis du DCE courant) doit AUSSI produire `RECONCILIATION_REQUIRED`, jamais `CURRENT` :
 * une réconciliation dont les `Finding`s sources sont eux-mêmes obsolètes ne peut pas prétendre que
 * la Checklist est à jour, même si elle a bien été réconciliée contre la dernière `analysisVersion`
 * disponible. `analysisIsCurrent` est un booléen pur (jamais `AnalysisFreshness` importé ici : ce
 * module `tenders/domain` ne dépend jamais de `analysis`, voir le motif documenté sur
 * `checklist-intelligence` pour ce sens de dépendance) — c'est à l'appelant (qui a déjà résolu
 * `AnalysisFreshness` séparément) de le réduire à `=== "CURRENT"`.
 */
export const ChecklistFreshness = { Current: "CURRENT", ReconciliationRequired: "RECONCILIATION_REQUIRED" } as const;
export type ChecklistFreshness = (typeof ChecklistFreshness)[keyof typeof ChecklistFreshness];

export function computeChecklistFreshness(
  currentAnalysisVersion: number | undefined,
  lastReconciledAnalysisVersion: number | undefined,
  analysisIsCurrent: boolean,
): ChecklistFreshness {
  if (currentAnalysisVersion === undefined || lastReconciledAnalysisVersion === undefined || !analysisIsCurrent) {
    return ChecklistFreshness.ReconciliationRequired;
  }
  return currentAnalysisVersion === lastReconciledAnalysisVersion ? ChecklistFreshness.Current : ChecklistFreshness.ReconciliationRequired;
}
