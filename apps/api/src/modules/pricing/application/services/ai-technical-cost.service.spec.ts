import { describe, expect, it } from "vitest";
import type { GenerationCostRow } from "../ports/generation-cost-reader";
import { aggregateAiTechnicalCosts, toAiTechnicalCost } from "./ai-technical-cost.service";

function row(overrides: Partial<GenerationCostRow> = {}): GenerationCostRow {
  return {
    generationId: "gen-1",
    clientAccountId: "client-1",
    tenderId: "tender-1",
    taskType: "EXECUTIVE_SUMMARY",
    status: "GENERATED",
    createdAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

describe("toAiTechnicalCost", () => {
  it("CALCULATED when both a cost amount and total tokens are present", () => {
    const cost = toAiTechnicalCost(row({ costAmount: "0.0042", currency: "USD", totalTokenCount: 30, inputTokenCount: 10, outputTokenCount: 20 }));
    expect(cost.status).toBe("CALCULATED");
    expect(cost.amount!.toFixed()).toBe("0.004200");
  });

  it("UNKNOWN for a FAILED generation — never a fabricated zero", () => {
    const cost = toAiTechnicalCost(row({ status: "FAILED", costAmount: undefined, totalTokenCount: undefined }));
    expect(cost.status).toBe("UNKNOWN");
    expect(cost.amount).toBeUndefined();
    expect(cost.reason).toBeTruthy();
  });

  it("UNKNOWN for a CANCELLED generation", () => {
    expect(toAiTechnicalCost(row({ status: "CANCELLED" })).status).toBe("UNKNOWN");
  });

  it("UNKNOWN for a PENDING/GENERATING generation (in progress)", () => {
    expect(toAiTechnicalCost(row({ status: "PENDING" })).status).toBe("UNKNOWN");
    expect(toAiTechnicalCost(row({ status: "GENERATING" })).status).toBe("UNKNOWN");
  });

  it("PARTIAL when tokens are known but no cost amount (snapshot unresolved)", () => {
    const cost = toAiTechnicalCost(row({ totalTokenCount: 30, inputTokenCount: 10, outputTokenCount: 20, costAmount: undefined }));
    expect(cost.status).toBe("PARTIAL");
    expect(cost.amount).toBeUndefined();
    expect(cost.totalTokenCount).toBe(30);
  });

  it("PARTIAL when a cost amount is known but tokens are missing", () => {
    const cost = toAiTechnicalCost(row({ costAmount: "0.01", currency: "USD", totalTokenCount: undefined }));
    expect(cost.status).toBe("PARTIAL");
    expect(cost.amount!.toFixed()).toBe("0.010000");
  });

  it("UNKNOWN when a GENERATED row somehow has neither cost nor tokens", () => {
    expect(toAiTechnicalCost(row({ costAmount: undefined, totalTokenCount: undefined })).status).toBe("UNKNOWN");
  });

  it("réaudit stabilité historique — un ancien coût figé reste lu tel quel, jamais recalculé avec un tarif plus récent (aucun accès au tarif ici, uniquement la lecture de la ligne)", () => {
    const oldGeneration = row({ costAmount: "0.001000", currency: "EUR", totalTokenCount: 100, createdAt: new Date("2026-01-01T00:00:00Z") });
    const cost = toAiTechnicalCost(oldGeneration);
    expect(cost.amount!.toFixed()).toBe("0.001000");
  });
});

describe("aggregateAiTechnicalCosts", () => {
  it("sums CALCULATED costs of the same currency, counts PARTIAL/UNKNOWN separately", () => {
    const rows = [
      row({ generationId: "g1", costAmount: "1.5", currency: "EUR", totalTokenCount: 10 }),
      row({ generationId: "g2", costAmount: "2.5", currency: "EUR", totalTokenCount: 10 }),
      row({ generationId: "g3", status: "FAILED" }),
      row({ generationId: "g4", totalTokenCount: 10, costAmount: undefined }),
    ];
    const aggregate = aggregateAiTechnicalCosts(rows);
    expect(aggregate.generationCount).toBe(4);
    expect(aggregate.calculatedCount).toBe(2);
    expect(aggregate.partialCount).toBe(1);
    expect(aggregate.unknownCount).toBe(1);
    expect(aggregate.totalsByCurrency.EUR!.toFixed()).toBe("4.000000");
  });

  it("keeps totals SEPARATE per currency — never a mixed sum (mission: no automatic conversion)", () => {
    const rows = [
      row({ generationId: "g1", costAmount: "10", currency: "EUR", totalTokenCount: 10 }),
      row({ generationId: "g2", costAmount: "5", currency: "USD", totalTokenCount: 10 }),
    ];
    const aggregate = aggregateAiTechnicalCosts(rows);
    expect(Object.keys(aggregate.totalsByCurrency).sort()).toEqual(["EUR", "USD"]);
    expect(aggregate.totalsByCurrency.EUR!.toFixed()).toBe("10.000000");
    expect(aggregate.totalsByCurrency.USD!.toFixed()).toBe("5.000000");
  });

  it("returns zero counts and no totals for an empty scope", () => {
    const aggregate = aggregateAiTechnicalCosts([]);
    expect(aggregate.generationCount).toBe(0);
    expect(Object.keys(aggregate.totalsByCurrency)).toHaveLength(0);
  });
});
