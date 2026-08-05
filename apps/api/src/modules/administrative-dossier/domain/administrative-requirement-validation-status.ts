import { InvalidAdministrativeRequirementValidationStatusTransitionError } from "./errors";

/**
 * Sprint 8C Phase 1 — mission §8 : "une exigence détectée par IA doit rester SUGGESTED... elle ne
 * doit jamais être validée automatiquement." Une fois décidée (CONFIRMED/REJECTED/NOT_APPLICABLE),
 * jamais de retour à SUGGESTED — un humain peut rouvrir vers un autre état décidé, jamais vers
 * "suggéré" (qui redeviendrait faussement une proposition IA non tranchée).
 */
export const AdministrativeRequirementValidationStatus = {
  Suggested: "SUGGESTED",
  Confirmed: "CONFIRMED",
  Rejected: "REJECTED",
  NotApplicable: "NOT_APPLICABLE",
} as const;

export type AdministrativeRequirementValidationStatus =
  (typeof AdministrativeRequirementValidationStatus)[keyof typeof AdministrativeRequirementValidationStatus];

export const ALLOWED_ADMINISTRATIVE_REQUIREMENT_VALIDATION_TRANSITIONS: Record<
  AdministrativeRequirementValidationStatus,
  readonly AdministrativeRequirementValidationStatus[]
> = {
  [AdministrativeRequirementValidationStatus.Suggested]: [
    AdministrativeRequirementValidationStatus.Confirmed,
    AdministrativeRequirementValidationStatus.Rejected,
    AdministrativeRequirementValidationStatus.NotApplicable,
  ],
  [AdministrativeRequirementValidationStatus.Confirmed]: [
    AdministrativeRequirementValidationStatus.Rejected,
    AdministrativeRequirementValidationStatus.NotApplicable,
  ],
  [AdministrativeRequirementValidationStatus.Rejected]: [
    AdministrativeRequirementValidationStatus.Confirmed,
    AdministrativeRequirementValidationStatus.NotApplicable,
  ],
  [AdministrativeRequirementValidationStatus.NotApplicable]: [
    AdministrativeRequirementValidationStatus.Confirmed,
    AdministrativeRequirementValidationStatus.Rejected,
  ],
};

export function canTransitionAdministrativeRequirementValidationStatus(
  from: AdministrativeRequirementValidationStatus,
  to: AdministrativeRequirementValidationStatus,
): boolean {
  return ALLOWED_ADMINISTRATIVE_REQUIREMENT_VALIDATION_TRANSITIONS[from].includes(to);
}

export function assertAdministrativeRequirementValidationStatusTransition(
  from: AdministrativeRequirementValidationStatus,
  to: AdministrativeRequirementValidationStatus,
): void {
  if (!canTransitionAdministrativeRequirementValidationStatus(from, to)) {
    throw new InvalidAdministrativeRequirementValidationStatusTransitionError({ from, to });
  }
}

export function isAdministrativeRequirementValidationStatus(value: string): value is AdministrativeRequirementValidationStatus {
  return Object.values(AdministrativeRequirementValidationStatus).includes(value as AdministrativeRequirementValidationStatus);
}
