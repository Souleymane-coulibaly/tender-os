export const DeliverableCommentStatus = {
  Open: "OPEN",
  Resolved: "RESOLVED",
} as const;

export type DeliverableCommentStatus = (typeof DeliverableCommentStatus)[keyof typeof DeliverableCommentStatus];
