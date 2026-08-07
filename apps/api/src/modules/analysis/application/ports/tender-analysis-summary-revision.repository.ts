export type TenderAnalysisSummaryRevisionRecord = Readonly<{
  id: string;
  organizationId: string;
  tenderId: string;
  baseSummaryId: string;
  revisionNumber: number;
  opportunitySummary?: string | undefined;
  complexityLevel?: string | undefined;
  mainCriteria?: readonly string[] | undefined;
  mainRisks?: readonly string[] | undefined;
  mainObligations?: readonly string[] | undefined;
  missingElements?: readonly string[] | undefined;
  pointsToClarify?: readonly string[] | undefined;
  conflicts?: unknown;
  editedByUserId: string;
  editedAt: string;
  reason?: string | undefined;
}>;

export type CreateTenderAnalysisSummaryRevisionInput = Readonly<{
  id: string;
  organizationId: string;
  tenderId: string;
  baseSummaryId: string;
  opportunitySummary?: string | undefined;
  complexityLevel?: string | undefined;
  mainCriteria?: readonly string[] | undefined;
  mainRisks?: readonly string[] | undefined;
  mainObligations?: readonly string[] | undefined;
  missingElements?: readonly string[] | undefined;
  pointsToClarify?: readonly string[] | undefined;
  conflicts?: unknown;
  editedByUserId: string;
  editedAt: Date;
  reason?: string | undefined;
}>;

/**
 * V2 Sprint 4 §"synthèse IA versionnée par révision utilisateur" — chaque révision est une NOUVELLE
 * ligne, jamais une mise à jour de `TenderAnalysisSummary` (l'original IA reste intact et
 * consultable indéfiniment via `BusinessAnalysisRepository.getSummary`/`getLatestSummary`) ni des
 * révisions précédentes (append-only, même motif que `AnalysisAttempt`).
 */
export interface TenderAnalysisSummaryRevisionRepository {
  /** `revisionNumber` est attribué de façon séquentielle (1, 2, 3...) par rapport à `baseSummaryId`
   *  — cas de concurrence rare et sans conséquence grave (deux révisions quasi simultanées de la
   *  même synthèse), protégé au pire par la contrainte unique `(organizationId, baseSummaryId,
   *  revisionNumber)` de la migration plutôt que par un verrou dédié (mission "ne pas complexifier
   *  inutilement"). */
  create(input: CreateTenderAnalysisSummaryRevisionInput): Promise<TenderAnalysisSummaryRevisionRecord>;

  /** Historique complet, la plus récente en premier — jamais filtré (même convention que
   *  `AnalysisJobRepository.listByTarget`). */
  listByBaseSummaryId(input: { organizationId: string; baseSummaryId: string }): Promise<TenderAnalysisSummaryRevisionRecord[]>;
}

export const TENDER_ANALYSIS_SUMMARY_REVISION_REPOSITORY = Symbol("TENDER_ANALYSIS_SUMMARY_REVISION_REPOSITORY");
