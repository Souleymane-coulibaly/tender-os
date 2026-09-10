import type { AnalysisFreshness } from "../../analysis";

/**
 * Checkpoint 2.1-P2.1-FIX-C — jamais persistée (même discipline que `computeAnalysisFreshness`/
 * `computeChecklistFreshness`/`withGoNoGoCandidateStaleness`), calculée en LECTURE SEULE.
 *
 * Un GO/NO-GO n'est `CURRENT` que si TOUTES les sources qu'il consomme réellement le sont encore :
 * - la Candidate figée au calcul est toujours la Candidate courante du Tender (réutilise
 *   `withGoNoGoCandidateStaleness`, A6.2, jamais remplacé) ;
 * - l'`analysisVersion` figée est toujours la DERNIÈRE analyse réussie du Tender (une analyse plus
 *   récente existe -> ce rapport ne l'a jamais vue) ;
 * - CETTE analyse est elle-même `CURRENT` vis-à-vis du DCE courant (capture indirectement un
 *   changement DCE même AVANT toute nouvelle analyse, mission §10 "attendu immédiatement" — pas
 *   besoin de comparer `dceRevision` directement : `AnalysisFreshness` de l'analyse effective
 *   courante encode déjà cette comparaison).
 *
 * Checklist est délibérément ABSENTE de cette liste. Depuis la fusion des « Pièces demandées »
 * (TENDEROS-2.1), le rapport lit les éléments DOCUMENTAIRES de la checklist, là où il lisait
 * `TenderRequestedDocument` ; pas plus que ces pièces hier, leur évolution ne rend un rapport
 * périmé. Un rapport GO/NO-GO est l'instantané d'une décision, pas un tableau de bord : rendre sa
 * fraîcheur dépendante de la checklist serait un changement de sémantique à part entière, jamais
 * un effet de bord de cette fusion.
 */
export const GoNoGoFreshness = { Current: "CURRENT", Stale: "STALE", Unknown: "UNKNOWN" } as const;
export type GoNoGoFreshness = (typeof GoNoGoFreshness)[keyof typeof GoNoGoFreshness];

export type GoNoGoFreshnessInput = Readonly<{
  /** `GoNoGoReportRecord.dceRevision` — `undefined` pour un rapport généré avant ce checkpoint. */
  reportDceRevision: number | undefined;
  reportAnalysisVersion: number;
  /** `EffectiveTenderAnalysisSummary.analysisVersion` résolue À LA LECTURE (pas au calcul). */
  currentAnalysisVersion: number | undefined;
  /** `EffectiveTenderAnalysisSummary.analysisFreshness` résolue À LA LECTURE. */
  currentAnalysisFreshness: AnalysisFreshness | undefined;
  candidateStale: boolean;
}>;

export function computeGoNoGoFreshness(input: GoNoGoFreshnessInput): GoNoGoFreshness {
  // Mission §26 — un rapport qui ne peut pas prouver sa provenance DCE (généré avant ce
  // checkpoint), ou dont l'analyse courante elle-même n'a pas de verdict de fraîcheur résolu,
  // n'est JAMAIS présenté comme CURRENT par défaut.
  if (
    input.reportDceRevision === undefined ||
    input.currentAnalysisVersion === undefined ||
    input.currentAnalysisFreshness === undefined ||
    input.currentAnalysisFreshness === "UNKNOWN"
  ) {
    return GoNoGoFreshness.Unknown;
  }
  if (input.candidateStale) return GoNoGoFreshness.Stale;
  if (input.reportAnalysisVersion !== input.currentAnalysisVersion) return GoNoGoFreshness.Stale;
  if (input.currentAnalysisFreshness !== "CURRENT") return GoNoGoFreshness.Stale;
  return GoNoGoFreshness.Current;
}
