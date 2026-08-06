import { describe, expect, it } from "vitest";
import { canTransitionSubcontractorProfileStatus, SubcontractorProfileStatus } from "./subcontractor-profile-status";

describe("canTransitionSubcontractorProfileStatus (mission V2 Sprint 2 §6)", () => {
  it("allows TO_VERIFY -> ACTIVE", () => {
    expect(canTransitionSubcontractorProfileStatus(SubcontractorProfileStatus.ToVerify, SubcontractorProfileStatus.Active)).toBe(true);
  });

  it("allows ACTIVE -> ARCHIVED (archivage, jamais suppression physique)", () => {
    expect(canTransitionSubcontractorProfileStatus(SubcontractorProfileStatus.Active, SubcontractorProfileStatus.Archived)).toBe(true);
  });

  it("allows ARCHIVED -> TO_VERIFY (restauration)", () => {
    expect(canTransitionSubcontractorProfileStatus(SubcontractorProfileStatus.Archived, SubcontractorProfileStatus.ToVerify)).toBe(true);
  });

  it("rejects a no-op transition to the same status", () => {
    expect(canTransitionSubcontractorProfileStatus(SubcontractorProfileStatus.Active, SubcontractorProfileStatus.Active)).toBe(false);
  });

  it("allows every status to eventually reach every other status (no dead end)", () => {
    const statuses = Object.values(SubcontractorProfileStatus);
    for (const from of statuses) {
      for (const to of statuses) {
        if (from === to) continue;
        expect(canTransitionSubcontractorProfileStatus(from, to)).toBe(true);
      }
    }
  });
});
