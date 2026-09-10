import { describe, expect, it } from "vitest";
import { Alert } from "./alert.entity";
import { AwardCriterion } from "./award-criterion.entity";
import { ChecklistItem, ChecklistItemStatus } from "./checklist-item.entity";
import { Milestone, MilestoneType } from "./milestone.entity";
import { calculateTenderReadiness } from "./readiness-calculator";
import { ReadinessStatus } from "./readiness-status";
import { Risk } from "./risk.entity";

const NOW = new Date("2026-06-01T00:00:00Z");

function requiredChecklistItem(status: ChecklistItemStatus): ChecklistItem {
  const item = ChecklistItem.create({
    id: "item-1",
    organizationId: "org-1",
    tenderId: "tender-1",
    title: "Item",
    required: true,
    occurredAt: NOW,
  });
  item.changeStatus(status, undefined, NOW);
  return item;
}

describe("calculateTenderReadiness", () => {
  it("returns a full score when there is nothing outstanding", () => {
    const result = calculateTenderReadiness({
      checklistItems: [],
      criteria: [
        AwardCriterion.create({
          id: "c-1",
          organizationId: "org-1",
          tenderId: "tender-1",
          name: "Prix",
          weight: "60",
          occurredAt: NOW,
        }),
      ],
      milestones: [],
      risks: [],
      alerts: [],
      analysis: "CURRENT",
      pendingMandatoryRequirements: 0,
      now: NOW,
    });

    expect(result.score).toBe(100);
    expect(result.status).toBe(ReadinessStatus.Ready);
    expect(result.criticalAlerts).toBe(0);
  });

  it("lowers the score when required checklist items are incomplete", () => {
    const result = calculateTenderReadiness({
      checklistItems: [requiredChecklistItem(ChecklistItemStatus.Todo)],
      criteria: [],
      milestones: [],
      risks: [],
      alerts: [],
      analysis: "CURRENT",
      pendingMandatoryRequirements: 0,
      now: NOW,
    });

    expect(result.score).toBeLessThan(100);
    expect(result.remainingItems).toBeGreaterThan(0);
  });

  it("caps the status at NOT_READY when a critical alert is unresolved, regardless of score", () => {
    const alert = Alert.create({
      id: "alert-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      type: "MANUAL",
      severity: "CRITICAL",
      message: "Blocage majeur",
      occurredAt: NOW,
    });

    const result = calculateTenderReadiness({
      checklistItems: [requiredChecklistItem(ChecklistItemStatus.Completed)],
      criteria: [],
      milestones: [],
      risks: [],
      alerts: [alert],
      analysis: "CURRENT",
      pendingMandatoryRequirements: 0,
      now: NOW,
    });

    expect(result.status).toBe(ReadinessStatus.NotReady);
    expect(result.criticalAlerts).toBe(1);
    expect(result.hasBlockingIssue).toBe(true);
  });

  it("caps the status at NOT_READY when a critical risk is unresolved", () => {
    const risk = Risk.create({
      id: "risk-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      title: "Risque majeur",
      severity: "CRITICAL",
      occurredAt: NOW,
    });

    const result = calculateTenderReadiness({
      checklistItems: [],
      criteria: [],
      milestones: [],
      risks: [risk],
      alerts: [],
      analysis: "CURRENT",
      pendingMandatoryRequirements: 0,
      now: NOW,
    });

    expect(result.status).toBe(ReadinessStatus.NotReady);
    expect(result.hasBlockingIssue).toBe(true);
  });

  it("has no blocking issue when everything is fine", () => {
    const result = calculateTenderReadiness({
      checklistItems: [],
      criteria: [],
      milestones: [],
      risks: [],
      alerts: [],
      analysis: "CURRENT",
      pendingMandatoryRequirements: 0,
      now: NOW,
    });

    expect(result.hasBlockingIssue).toBe(false);
  });

  it("counts an overdue milestone as a warning and reduces the score", () => {
    const overdueMilestone = Milestone.create({
      id: "milestone-1",
      organizationId: "org-1",
      tenderId: "tender-1",
      title: "Visite obligatoire",
      date: new Date("2026-01-01T00:00:00Z"),
      type: MilestoneType.MandatoryVisit,
      occurredAt: NOW,
    });

    const result = calculateTenderReadiness({
      checklistItems: [],
      criteria: [],
      milestones: [overdueMilestone],
      risks: [],
      alerts: [],
      analysis: "CURRENT",
      pendingMandatoryRequirements: 0,
      now: NOW,
    });

    expect(result.warnings).toBe(1);
    expect(result.score).toBeLessThan(100);
  });

  it("TENDEROS-2.1 — les pièces demandées sont fusionnées dans la checklist : 60 points, total 100", () => {
    // Les 25 points de l'ancienne dimension « Pièces obligatoires » rejoignent la checklist, où les
    // pièces ont été reprises : les exigences suivies ne changent pas de poids, seulement d'endroit.
    const result = calculateTenderReadiness({
      checklistItems: [],
      criteria: [],
      milestones: [],
      risks: [],
      alerts: [],
      analysis: "CURRENT",
      pendingMandatoryRequirements: 0,
      now: NOW,
    });

    expect(result.breakdown.map((entry) => entry.label)).not.toContain("Pièces obligatoires");
    expect(result.breakdown.find((entry) => entry.label === "Checklist obligatoire")?.weight).toBe(60);
    expect(result.breakdown.reduce((sum, entry) => sum + entry.weight, 0)).toBe(100);
  });
});
