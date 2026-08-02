/** Mission §13 — une décision de revue est toujours liée à une révision EXACTE, jamais à une
 *  section ou un livrable en général. */
export const DeliverableReviewDecision = {
  Approved: "APPROVED",
  ChangesRequested: "CHANGES_REQUESTED",
  Rejected: "REJECTED",
} as const;

export type DeliverableReviewDecision = (typeof DeliverableReviewDecision)[keyof typeof DeliverableReviewDecision];

export function isDeliverableReviewDecision(value: string): value is DeliverableReviewDecision {
  return Object.values(DeliverableReviewDecision).includes(value as DeliverableReviewDecision);
}
