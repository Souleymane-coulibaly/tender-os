export const ExportStatus = {
  Pending: "PENDING",
  Generating: "GENERATING",
  Completed: "COMPLETED",
  Failed: "FAILED",
} as const;

export type ExportStatus = (typeof ExportStatus)[keyof typeof ExportStatus];

/** Même discipline que `AnalysisStatus`/`GenerationStatus` — une transition non listée ici est
 *  refusée (mission "un export historique reste immuable" : ni COMPLETED ni FAILED ne transitent
 *  vers autre chose). */
const ALLOWED_TRANSITIONS: Record<ExportStatus, readonly ExportStatus[]> = {
  [ExportStatus.Pending]: [ExportStatus.Generating],
  [ExportStatus.Generating]: [ExportStatus.Completed, ExportStatus.Failed],
  [ExportStatus.Completed]: [],
  [ExportStatus.Failed]: [],
};

export function canTransitionExportStatus(from: ExportStatus, to: ExportStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
