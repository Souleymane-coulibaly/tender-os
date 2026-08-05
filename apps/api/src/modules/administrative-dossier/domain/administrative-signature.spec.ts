import { describe, expect, it } from "vitest";
import { AdministrativeSignatureStatus, assertAdministrativeSignatureStatusTransition, canTransitionAdministrativeSignatureStatus } from "./administrative-signature";
import { InvalidAdministrativeSignatureStatusTransitionError } from "./errors";

describe("administrative-signature transitions — mission §18", () => {
  it("allows PENDING -> SIGNED/REJECTED/EXPIRED/CANCELLED", () => {
    expect(canTransitionAdministrativeSignatureStatus(AdministrativeSignatureStatus.Pending, AdministrativeSignatureStatus.Signed)).toBe(true);
    expect(canTransitionAdministrativeSignatureStatus(AdministrativeSignatureStatus.Pending, AdministrativeSignatureStatus.Rejected)).toBe(true);
  });

  it("NOT_REQUIRED and terminal states have no outgoing transitions via the status table (only setSignatureMode can move NOT_REQUIRED)", () => {
    expect(canTransitionAdministrativeSignatureStatus(AdministrativeSignatureStatus.NotRequired, AdministrativeSignatureStatus.Pending)).toBe(false);
    expect(canTransitionAdministrativeSignatureStatus(AdministrativeSignatureStatus.Signed, AdministrativeSignatureStatus.Rejected)).toBe(false);
  });

  it("throws InvalidAdministrativeSignatureStatusTransitionError for a disallowed transition", () => {
    expect(() => assertAdministrativeSignatureStatusTransition(AdministrativeSignatureStatus.Signed, AdministrativeSignatureStatus.Pending)).toThrow(
      InvalidAdministrativeSignatureStatusTransitionError,
    );
  });
});
