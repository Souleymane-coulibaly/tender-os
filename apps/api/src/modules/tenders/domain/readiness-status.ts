export const ReadinessStatus = {
  NotReady: "NOT_READY",
  InProgress: "IN_PROGRESS",
  ReadyWithWarnings: "READY_WITH_WARNINGS",
  Ready: "READY",
} as const;
export type ReadinessStatus = (typeof ReadinessStatus)[keyof typeof ReadinessStatus];
