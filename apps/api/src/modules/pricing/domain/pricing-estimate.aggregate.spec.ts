import { describe, expect, it } from "vitest";
import { CostBreakdownLine } from "./cost-breakdown-line";
import { Money } from "./money.value-object";
import { PricingAssumptions } from "./pricing-assumptions";
import { PricingEstimate } from "./pricing-estimate.aggregate";
import { PricingEstimateVersion } from "./pricing-estimate-version.entity";
import { PricingSource } from "./pricing-source";
import { PricingStatus } from "./pricing-status";
import { PricingType } from "./pricing-type";

const NOW = new Date("2026-08-15T10:00:00.000Z");

function buildVersion(overrides: Partial<Parameters<typeof PricingEstimateVersion.create>[0]> = {}) {
  return PricingEstimateVersion.create({
    id: "version-1",
    estimateId: "estimate-1",
    organizationId: "org-1",
    version: 1,
    amount: Money.create({ amount: "100", currency: "EUR" }),
    breakdown: [
      CostBreakdownLine.create({
        type: "AI_COST",
        label: "Coût IA estimé",
        amount: Money.create({ amount: "100", currency: "EUR" }),
        source: PricingSource.Estimated,
        displayOrder: 0,
      }),
    ],
    assumptions: PricingAssumptions.create({ estimatedGenerationsCount: 5 }),
    status: PricingStatus.Calculated,
    disclaimerVersion: 1,
    source: "MANUAL",
    createdBy: "user-1",
    createdAt: NOW,
    ...overrides,
  });
}

describe("PricingEstimate aggregate", () => {
  it("requires a clientAccountId or tenderId for a scoped estimate type", () => {
    expect(() =>
      PricingEstimate.create({ id: "e1", organizationId: "org-1", type: PricingType.TenderEstimate, createdBy: "user-1", occurredAt: NOW }),
    ).toThrow();
  });

  it("allows an ORGANIZATION_COST_SUMMARY estimate without a client/tender scope", () => {
    const estimate = PricingEstimate.create({
      id: "e1",
      organizationId: "org-1",
      type: PricingType.OrganizationCostSummary,
      createdBy: "user-1",
      occurredAt: NOW,
    });
    expect(estimate.status).toBe(PricingStatus.Draft);
    expect(estimate.currentVersionNumber).toBe(0);
  });

  it("attachVersion() records the current version pointer and status", () => {
    const estimate = PricingEstimate.create({
      id: "e1",
      organizationId: "org-1",
      tenderId: "tender-1",
      type: PricingType.TenderEstimate,
      createdBy: "user-1",
      occurredAt: NOW,
    });
    estimate.attachVersion({ versionId: "version-1", versionNumber: 1, status: PricingStatus.Calculated });
    expect(estimate.currentVersionId).toBe("version-1");
    expect(estimate.currentVersionNumber).toBe(1);
    expect(estimate.status).toBe(PricingStatus.Calculated);
  });

  it("archive() sets ARCHIVED and archivedAt, and can never be archived twice", () => {
    const estimate = PricingEstimate.create({
      id: "e1",
      organizationId: "org-1",
      tenderId: "tender-1",
      type: PricingType.TenderEstimate,
      createdBy: "user-1",
      occurredAt: NOW,
    });
    estimate.attachVersion({ versionId: "version-1", versionNumber: 1, status: PricingStatus.Calculated });
    estimate.archive(NOW);
    expect(estimate.status).toBe(PricingStatus.Archived);
    expect(estimate.archivedAt).toEqual(NOW);
    expect(() => estimate.archive(NOW)).toThrow();
  });

  it("attachVersion() throws once the estimate is archived — never a version created on a dead estimate", () => {
    const estimate = PricingEstimate.create({
      id: "e1",
      organizationId: "org-1",
      tenderId: "tender-1",
      type: PricingType.TenderEstimate,
      createdBy: "user-1",
      occurredAt: NOW,
    });
    estimate.attachVersion({ versionId: "version-1", versionNumber: 1, status: PricingStatus.Calculated });
    estimate.archive(NOW);
    expect(() => estimate.attachVersion({ versionId: "version-2", versionNumber: 2, status: PricingStatus.Calculated })).toThrow();
  });
});

describe("PricingEstimateVersion entity", () => {
  it("is created with the given amount/breakdown/assumptions, immutable thereafter", () => {
    const version = buildVersion();
    expect(version.amount.toFixed()).toBe("100.000000");
    expect(version.breakdown).toHaveLength(1);
    expect(version.status).toBe(PricingStatus.Calculated);
    expect(version.supersededAt).toBeUndefined();
  });

  it("supersede() marks SUPERSEDED and records the date, never touching the frozen amount", () => {
    const version = buildVersion();
    version.supersede(NOW);
    expect(version.status).toBe(PricingStatus.Superseded);
    expect(version.supersededAt).toEqual(NOW);
    expect(version.amount.toFixed()).toBe("100.000000");
  });
});

describe("CostBreakdownLine", () => {
  it("rejects an empty type or label", () => {
    expect(() =>
      CostBreakdownLine.create({
        type: "",
        label: "x",
        amount: Money.create({ amount: "1", currency: "EUR" }),
        source: PricingSource.Estimated,
        displayOrder: 0,
      }),
    ).toThrow();
  });

  it("rejects a unitPrice whose currency differs from the amount's currency", () => {
    expect(() =>
      CostBreakdownLine.create({
        type: "AI_COST",
        label: "Coût IA",
        unitPrice: Money.create({ amount: "1", currency: "USD" }),
        amount: Money.create({ amount: "10", currency: "EUR" }),
        source: PricingSource.Estimated,
        displayOrder: 0,
      }),
    ).toThrow();
  });
});

describe("PricingAssumptions", () => {
  it("rejects an out-of-bounds generations count", () => {
    expect(() => PricingAssumptions.create({ estimatedGenerationsCount: -1 })).toThrow();
    expect(() => PricingAssumptions.create({ estimatedGenerationsCount: 999_999 })).toThrow();
  });

  it("rejects notes exceeding the maximum length", () => {
    expect(() => PricingAssumptions.create({ notes: "x".repeat(2_001) })).toThrow();
  });

  it("accepts a well-formed set of assumptions and exposes them verbatim", () => {
    const assumptions = PricingAssumptions.create({
      taskTypes: ["EXECUTIVE_SUMMARY"],
      estimatedGenerationsCount: 10,
      workHours: 20,
      hourlyRate: "50",
      headcount: 2,
      additionalFeesAmount: "30",
      notes: "Hypothèse initiale",
    });
    expect(assumptions.estimatedGenerationsCount).toBe(10);
    expect(assumptions.hourlyRate).toBe("50");
    expect(assumptions.notes).toBe("Hypothèse initiale");
  });
});
