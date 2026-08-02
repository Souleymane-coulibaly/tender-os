/** Mission §14 — statut de couverture d'une exigence dans la matrice de conformité. */
export const ComplianceCoverageStatus = {
  Covered: "COVERED",
  PartiallyCovered: "PARTIALLY_COVERED",
  NotCovered: "NOT_COVERED",
  NotApplicable: "NOT_APPLICABLE",
  ToConfirm: "TO_CONFIRM",
} as const;

export type ComplianceCoverageStatus = (typeof ComplianceCoverageStatus)[keyof typeof ComplianceCoverageStatus];

export function isComplianceCoverageStatus(value: string): value is ComplianceCoverageStatus {
  return Object.values(ComplianceCoverageStatus).includes(value as ComplianceCoverageStatus);
}

export const Criticality = {
  Low: "LOW",
  Medium: "MEDIUM",
  High: "HIGH",
  Critical: "CRITICAL",
} as const;

export type Criticality = (typeof Criticality)[keyof typeof Criticality];

export function isCriticality(value: string): value is Criticality {
  return Object.values(Criticality).includes(value as Criticality);
}
