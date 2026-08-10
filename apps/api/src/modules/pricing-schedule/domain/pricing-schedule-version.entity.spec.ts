import { describe, expect, it } from "vitest";
import { PricingScheduleVersion } from "./pricing-schedule-version.entity";
import { PricingScheduleVersionValidatedError } from "./errors";
import { PricingScheduleVersionStatus } from "./enums";

function createVersion() {
  return PricingScheduleVersion.create({
    id: "version-1",
    organizationId: "org-1",
    pricingScheduleId: "schedule-1",
    versionNumber: 1,
    sourceDocumentVersionId: "doc-version-1",
    createdBy: "user-1",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
  });
}

describe("PricingScheduleVersion", () => {
  it("starts DRAFT with mappingVersion 1 by default", () => {
    const version = createVersion();
    expect(version.status).toBe(PricingScheduleVersionStatus.Draft);
    expect(version.mappingVersion).toBe(1);
    expect(version.isValidated).toBe(false);
  });

  it("markInReview transitions to IN_REVIEW", () => {
    const version = createVersion();
    version.markInReview();
    expect(version.status).toBe(PricingScheduleVersionStatus.InReview);
  });

  it("validate records validatedBy/validatedAt and becomes immutable", () => {
    const version = createVersion();
    const validatedAt = new Date("2026-01-05T00:00:00Z");
    version.validate({ validatedBy: "user-2", occurredAt: validatedAt });
    expect(version.status).toBe(PricingScheduleVersionStatus.Validated);
    expect(version.validatedBy).toBe("user-2");
    expect(version.validatedAt).toBe(validatedAt);
    expect(version.isValidated).toBe(true);
  });

  it("BLOQUANT — a VALIDATED version refuses markInReview/validate/correctMapping (mission §45 immutability)", () => {
    const version = createVersion();
    version.validate({ validatedBy: "user-2", occurredAt: new Date() });

    expect(() => version.markInReview()).toThrow(PricingScheduleVersionValidatedError);
    expect(() => version.validate({ validatedBy: "user-3", occurredAt: new Date() })).toThrow(PricingScheduleVersionValidatedError);
    expect(() => version.correctMapping(2)).toThrow(PricingScheduleVersionValidatedError);
  });

  it("correctMapping refuses a mapping version that does not strictly increase", () => {
    const version = createVersion();
    version.correctMapping(2);
    expect(version.mappingVersion).toBe(2);
    expect(() => version.correctMapping(2)).toThrow();
    expect(() => version.correctMapping(1)).toThrow();
  });
});
