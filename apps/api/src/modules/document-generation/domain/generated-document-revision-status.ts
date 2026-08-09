/** Statut TECHNIQUE d'une tentative de génération — même motif qu'`ExportJob.status`. Distinct de
 *  `ReviewStatus` (statut métier, voir `review-status.ts`). */
export const GeneratedDocumentRevisionStatus = {
  Pending: "PENDING",
  Generating: "GENERATING",
  Completed: "COMPLETED",
  Failed: "FAILED",
} as const;

export type GeneratedDocumentRevisionStatus = (typeof GeneratedDocumentRevisionStatus)[keyof typeof GeneratedDocumentRevisionStatus];
