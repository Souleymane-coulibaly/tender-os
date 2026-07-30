/** Nature d'une échéance consolidée (mission Sprint 4.2 §2 "Dates et échéances"). */
export const DeadlineKind = {
  Publication: "PUBLICATION",
  Submission: "SUBMISSION",
  Questions: "QUESTIONS",
  Answer: "ANSWER",
  Visit: "VISIT",
  StartEstimated: "START_ESTIMATED",
  ValidityPeriod: "VALIDITY_PERIOD",
  Intermediate: "INTERMEDIATE",
  Contractual: "CONTRACTUAL",
  Other: "OTHER",
} as const;

export type DeadlineKind = (typeof DeadlineKind)[keyof typeof DeadlineKind];

export function isDeadlineKind(value: string): value is DeadlineKind {
  return Object.values(DeadlineKind).includes(value as DeadlineKind);
}
