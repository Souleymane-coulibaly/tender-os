import { describe, expect, it } from "vitest";
import { Milestone, MilestoneType } from "./milestone.entity";

describe("Milestone#isOverdue", () => {
  it("is overdue when the date is in the past and status is still PENDING", () => {
    const milestone = Milestone.create({
      id: "m-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      title: "Visite obligatoire",
      date: new Date("2026-01-01T00:00:00Z"),
      type: MilestoneType.MandatoryVisit,
      occurredAt: new Date("2025-12-01T00:00:00Z"),
    });

    expect(milestone.isOverdue(new Date("2026-02-01T00:00:00Z"))).toBe(true);
  });

  it("is not overdue once marked DONE", () => {
    const milestone = Milestone.create({
      id: "m-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      title: "Visite obligatoire",
      date: new Date("2026-01-01T00:00:00Z"),
      type: MilestoneType.MandatoryVisit,
      occurredAt: new Date("2025-12-01T00:00:00Z"),
    });
    milestone.markDone(new Date("2025-12-15T00:00:00Z"));

    expect(milestone.isOverdue(new Date("2026-02-01T00:00:00Z"))).toBe(false);
  });
});
