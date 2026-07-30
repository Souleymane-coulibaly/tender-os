import { describe, expect, it } from "vitest";
import { Risk } from "../domain/risk.entity";
import { TenderId } from "../domain/tender-id.value-object";
import { Tender } from "../domain/tender.aggregate";
import { enrichTenders } from "./tender-enrichment";

const NOW = new Date("2026-06-01T00:00:00Z");

function tender(id: string, overrides: Partial<Parameters<typeof Tender.create>[0]> = {}): Tender {
  return Tender.create({
    id: TenderId.from(id),
    organizationId: "org-1",
    clientAccountId: "client-1",
    title: `Tender ${id}`,
    createdBy: "user-1",
    occurredAt: NOW,
    ...overrides,
  });
}

describe("enrichTenders", () => {
  it("computes one enrichment entry per tender using only its own sub-resources", () => {
    const tenderA = tender("tender-a");
    const tenderB = tender("tender-b");
    const riskForA = Risk.create({
      id: "risk-1",
      organizationId: "org-1",
      tenderId: "tender-a",
      title: "Risque",
      severity: "LOW",
      occurredAt: NOW,
    });

    const result = enrichTenders({
      tenders: [tenderA, tenderB],
      checklistItems: [],
      requestedDocuments: [],
      criteria: [],
      milestones: [],
      risks: [riskForA],
      alerts: [],
      now: NOW,
    });

    expect(result.get("tender-a")?.openRisksCount).toBe(1);
    expect(result.get("tender-b")?.openRisksCount).toBe(0);
  });

  it("flags a tender as overdue only when its own deadline has passed and it is still active", () => {
    const overdueTender = tender("tender-overdue", { submissionDeadline: new Date("2020-01-01T00:00:00Z") });
    const futureTender = tender("tender-future", { submissionDeadline: new Date("2030-01-01T00:00:00Z") });

    const result = enrichTenders({
      tenders: [overdueTender, futureTender],
      checklistItems: [],
      requestedDocuments: [],
      criteria: [],
      milestones: [],
      risks: [],
      alerts: [],
      now: NOW,
    });

    expect(result.get("tender-overdue")?.overdue).toBe(true);
    expect(result.get("tender-future")?.overdue).toBe(false);
  });

  it("does not flag an overdue-deadline tender as overdue once it reaches a terminal status", () => {
    const submittedTender = tender("tender-submitted", { submissionDeadline: new Date("2020-01-01T00:00:00Z") });
    submittedTender.changeStatus("IN_ANALYSIS", NOW);
    submittedTender.changeStatus("READY", NOW);
    submittedTender.changeStatus("IN_PREPARATION", NOW);
    submittedTender.changeStatus("READY_TO_SUBMIT", NOW);
    submittedTender.changeStatus("SUBMITTED", NOW);

    const result = enrichTenders({
      tenders: [submittedTender],
      checklistItems: [],
      requestedDocuments: [],
      criteria: [],
      milestones: [],
      risks: [],
      alerts: [],
      now: NOW,
    });

    expect(result.get("tender-submitted")?.overdue).toBe(false);
  });
});
