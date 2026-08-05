import { describe, expect, it } from "vitest";
import { EngagementAct } from "./engagement-act.aggregate";
import { EngagementActPricingAlreadyFrozenError } from "./errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");

function baseAct() {
  return EngagementAct.create({ id: "ae-1", organizationId: "org-1", tenderId: "tender-1", createdBy: "user-1", occurredAt: NOW });
}

describe("EngagementAct — mission §14 gel du pricing (correctif audit Codex P1-002, même motif)", () => {
  it("freezePricing pins the pricing estimate id/version and amount", () => {
    const act = baseAct();
    act.freezePricing({ pricingEstimateId: "estimate-1", pricingEstimateVersionNumber: 1, amountValue: 50000, amountCurrency: "EUR", frozenBy: "user-2", occurredAt: NOW });
    expect(act.pricingEstimateId).toBe("estimate-1");
    expect(act.frozenAmountValue).toBe(50000);
  });

  it("re-freezing the EXACT same pair is an idempotent no-op", () => {
    const act = baseAct();
    act.freezePricing({ pricingEstimateId: "estimate-1", pricingEstimateVersionNumber: 1, amountValue: 50000, amountCurrency: "EUR", frozenBy: "user-2", occurredAt: NOW });
    expect(() => act.freezePricing({ pricingEstimateId: "estimate-1", pricingEstimateVersionNumber: 1, amountValue: 50000, amountCurrency: "EUR", frozenBy: "user-2", occurredAt: NOW })).not.toThrow();
  });

  it("refuses freezing a DIFFERENT pair while one is already frozen — never a silent replacement", () => {
    const act = baseAct();
    act.freezePricing({ pricingEstimateId: "estimate-1", pricingEstimateVersionNumber: 1, amountValue: 50000, amountCurrency: "EUR", frozenBy: "user-2", occurredAt: NOW });
    expect(() =>
      act.freezePricing({ pricingEstimateId: "estimate-1", pricingEstimateVersionNumber: 2, amountValue: 55000, amountCurrency: "EUR", frozenBy: "user-2", occurredAt: NOW }),
    ).toThrow(EngagementActPricingAlreadyFrozenError);
  });

  it("unfreezePricing explicitly clears the frozen reference, allowing a different pair afterwards", () => {
    const act = baseAct();
    act.freezePricing({ pricingEstimateId: "estimate-1", pricingEstimateVersionNumber: 1, amountValue: 50000, amountCurrency: "EUR", frozenBy: "user-2", occurredAt: NOW });
    act.unfreezePricing(NOW);
    expect(act.pricingEstimateId).toBeUndefined();
    expect(() =>
      act.freezePricing({ pricingEstimateId: "estimate-1", pricingEstimateVersionNumber: 2, amountValue: 55000, amountCurrency: "EUR", frozenBy: "user-2", occurredAt: NOW }),
    ).not.toThrow();
  });
});
