import { describe, expect, it } from "vitest";
import { PricingSchedule } from "./pricing-schedule.aggregate";
import { FinancialDocumentType, PricingScheduleStatus } from "./enums";

function createSchedule() {
  return PricingSchedule.create({
    id: "schedule-1",
    organizationId: "org-1",
    tenderId: "tender-1",
    clientAccountId: "client-1",
    financialDocumentType: FinancialDocumentType.Bpu,
    sourceDocumentId: "doc-1",
    sourceDocumentVersionId: "doc-version-1",
    createdBy: "user-1",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
  });
}

describe("PricingSchedule", () => {
  it("starts DRAFT with no current version", () => {
    const schedule = createSchedule();
    expect(schedule.status).toBe(PricingScheduleStatus.Draft);
    expect(schedule.currentVersionId).toBeUndefined();
    expect(schedule.currentVersionNumber).toBe(0);
  });

  it("advanceToVersion moves to READY and records the version pointer", () => {
    const schedule = createSchedule();
    schedule.advanceToVersion({ versionId: "version-1", versionNumber: 1, occurredAt: new Date("2026-01-02T00:00:00Z") });
    expect(schedule.status).toBe(PricingScheduleStatus.Ready);
    expect(schedule.currentVersionId).toBe("version-1");
    expect(schedule.currentVersionNumber).toBe(1);
  });

  it("BLOQUANT — refuses a version number that does not strictly increase", () => {
    const schedule = createSchedule();
    schedule.advanceToVersion({ versionId: "version-1", versionNumber: 1, occurredAt: new Date() });
    expect(() => schedule.advanceToVersion({ versionId: "version-1-again", versionNumber: 1, occurredAt: new Date() })).toThrow();
    expect(() => schedule.advanceToVersion({ versionId: "version-0", versionNumber: 0, occurredAt: new Date() })).toThrow();
  });

  it("BLOQUANT — creating a new version after VALIDATED/EXPORTED moves the schedule back to READY, never leaves it VALIDATED for stale prices", () => {
    const schedule = createSchedule();
    schedule.advanceToVersion({ versionId: "version-1", versionNumber: 1, occurredAt: new Date() });
    schedule.markValidated(new Date());
    schedule.markExported(new Date());
    expect(schedule.status).toBe(PricingScheduleStatus.Exported);

    schedule.advanceToVersion({ versionId: "version-2", versionNumber: 2, occurredAt: new Date() });
    expect(schedule.status).toBe(PricingScheduleStatus.Ready);
  });

  it("markValidated / markExported transition status", () => {
    const schedule = createSchedule();
    schedule.markValidated(new Date());
    expect(schedule.status).toBe(PricingScheduleStatus.Validated);
    schedule.markExported(new Date());
    expect(schedule.status).toBe(PricingScheduleStatus.Exported);
  });
});
