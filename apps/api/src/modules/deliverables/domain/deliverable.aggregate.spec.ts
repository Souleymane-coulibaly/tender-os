import { describe, expect, it } from "vitest";
import { Deliverable } from "./deliverable.aggregate";
import { DeliverableType } from "./deliverable-type";
import { DeliverableCostReportAlreadyFrozenError } from "./errors";

const NOW = new Date("2026-09-06T10:00:00.000Z");
const LATER = new Date("2026-09-07T10:00:00.000Z");

function fakeDeliverable(): Deliverable {
  return Deliverable.create({ id: "deliverable-1", organizationId: "org-1", clientAccountId: "client-1", tenderId: "tender-1", type: DeliverableType.CostReport, createdBy: "user-1", occurredAt: NOW });
}

/**
 * Correctif audit Codex P1-002 — "le rapport financier doit référencer explicitement une version
 * figée du Sprint 7" : une fois posée, la référence (pricingEstimateId, versionNumber) est
 * IMMUABLE — un recalcul Sprint 7 ultérieur ne doit jamais pouvoir la faire glisser silencieusement.
 */
describe("Deliverable.selectCostReportEstimate (mission P1-002 — figement immuable)", () => {
  it("fige la référence pricing la première fois", () => {
    const deliverable = fakeDeliverable();

    deliverable.selectCostReportEstimate({ pricingEstimateId: "estimate-1", versionNumber: 1, selectedBy: "user-1", occurredAt: NOW });

    expect(deliverable.costReportPricingEstimateId).toBe("estimate-1");
    expect(deliverable.costReportPricingEstimateVersionNumber).toBe(1);
    expect(deliverable.costReportSelectedBy).toBe("user-1");
    expect(deliverable.costReportSelectedAt).toEqual(NOW);
  });

  it("refuse de remplacer une référence déjà figée par une AUTRE estimation/version", () => {
    const deliverable = fakeDeliverable();
    deliverable.selectCostReportEstimate({ pricingEstimateId: "estimate-1", versionNumber: 1, selectedBy: "user-1", occurredAt: NOW });

    expect(() => deliverable.selectCostReportEstimate({ pricingEstimateId: "estimate-2", versionNumber: 1, selectedBy: "user-2", occurredAt: LATER })).toThrow(
      DeliverableCostReportAlreadyFrozenError,
    );
    expect(() => deliverable.selectCostReportEstimate({ pricingEstimateId: "estimate-1", versionNumber: 2, selectedBy: "user-2", occurredAt: LATER })).toThrow(
      DeliverableCostReportAlreadyFrozenError,
    );
    // La référence d'origine reste inchangée après les tentatives refusées.
    expect(deliverable.costReportPricingEstimateId).toBe("estimate-1");
    expect(deliverable.costReportPricingEstimateVersionNumber).toBe(1);
    expect(deliverable.costReportSelectedBy).toBe("user-1");
  });

  it("tolère une resélection idempotente de EXACTEMENT la même paire (estimateId, versionNumber)", () => {
    const deliverable = fakeDeliverable();
    deliverable.selectCostReportEstimate({ pricingEstimateId: "estimate-1", versionNumber: 1, selectedBy: "user-1", occurredAt: NOW });

    expect(() => deliverable.selectCostReportEstimate({ pricingEstimateId: "estimate-1", versionNumber: 1, selectedBy: "user-1", occurredAt: LATER })).not.toThrow();
  });
});
