/**
 * Checkpoint 2.1-P2.1-FIX-A — jamais persistée (même discipline que
 * `GoNoGoReportRecord.candidateStale`/`withGoNoGoCandidateStaleness`), calculée en LECTURE SEULE à
 * chaque lecture en comparant une révision DCE FIGÉE à la persistance (`dceRevision`) à la révision
 * DCE courante. Fonction pure, extraite ici (plutôt que dans l'une ou l'autre des use cases qui la
 * consomment) pour éviter un import circulaire entre `GetTenderBusinessAnalysisUseCase` et
 * `GetEffectiveTenderAnalysisSummaryUseCase`, qui la consomment toutes les deux indépendamment.
 */
export const AnalysisFreshness = { Current: "CURRENT", Stale: "STALE", Unknown: "UNKNOWN" } as const;
export type AnalysisFreshness = (typeof AnalysisFreshness)[keyof typeof AnalysisFreshness];

/** `UNKNOWN` — jamais un `CURRENT`/`STALE` inventé — dès que l'un des deux termes est indisponible
 *  (ligne historique sans `dceRevision`, ou aucun Dce trouvé pour ce Tender, mission §22). */
export function computeAnalysisFreshness(capturedDceRevision: number | undefined, currentDceRevision: number | undefined): AnalysisFreshness {
  if (capturedDceRevision === undefined || currentDceRevision === undefined) {
    return AnalysisFreshness.Unknown;
  }
  return capturedDceRevision === currentDceRevision ? AnalysisFreshness.Current : AnalysisFreshness.Stale;
}
