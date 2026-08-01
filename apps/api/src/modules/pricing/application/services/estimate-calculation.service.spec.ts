import { describe, expect, it } from "vitest";
import { PricingAssumptions } from "../../domain/pricing-assumptions";
import type { CurrentModelPricing } from "../ports/pricing-snapshot-reader";
import { calculateEstimateBreakdown } from "./estimate-calculation.service";

const MODEL_PRICING: CurrentModelPricing = {
  aiModelId: "model-1",
  provider: "OPENAI",
  modelKey: "gpt-4o-mini",
  inputPricePerMillionTokens: "5",
  outputPricePerMillionTokens: "15",
  currency: "USD",
  effectiveFrom: new Date("2026-01-01T00:00:00Z"),
};

describe("calculateEstimateBreakdown", () => {
  it("computes an AI cost line from generations count × tokens × the resolved model's current price", () => {
    const assumptions = PricingAssumptions.create({
      estimatedGenerationsCount: 10,
      estimatedInputTokensPerGeneration: 100_000,
      estimatedOutputTokensPerGeneration: 50_000,
    });
    const result = calculateEstimateBreakdown({ assumptions, modelPricing: MODEL_PRICING });
    // 1,000,000 input tokens @ $5/M + 500,000 output tokens @ $15/M = 5 + 7.5 = 12.5
    expect(result.amount.toFixed()).toBe("12.500000");
    expect(result.amount.currency).toBe("USD");
    expect(result.status).toBe("CALCULATED");
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0]!.type).toBe("AI_COST");
    expect(result.breakdown[0]!.source).toBe("ESTIMATED");
  });

  it("marks the result PARTIAL when AI usage is requested but no model is routed (never a fabricated cost)", () => {
    const assumptions = PricingAssumptions.create({ estimatedGenerationsCount: 10, estimatedInputTokensPerGeneration: 1000 });
    const result = calculateEstimateBreakdown({ assumptions, modelPricing: undefined });
    expect(result.status).toBe("PARTIAL");
    expect(result.breakdown).toHaveLength(0);
    expect(result.amount.isZero).toBe(true);
  });

  it("computes a production-time line from workHours × hourlyRate × headcount, defaulting EUR", () => {
    const assumptions = PricingAssumptions.create({ workHours: 8, hourlyRate: "100", headcount: 2 });
    const result = calculateEstimateBreakdown({ assumptions });
    expect(result.amount.toFixed()).toBe("1600.000000");
    expect(result.amount.currency).toBe("EUR");
    expect(result.status).toBe("CALCULATED");
  });

  it("adds a fees line and combines it with production time, same currency", () => {
    const assumptions = PricingAssumptions.create({ workHours: 1, hourlyRate: "100", additionalFeesAmount: "50" });
    const result = calculateEstimateBreakdown({ assumptions });
    expect(result.amount.toFixed()).toBe("150.000000");
    expect(result.breakdown).toHaveLength(2);
  });

  it("combines an AI cost line with a production line under the model pricing's currency", () => {
    const assumptions = PricingAssumptions.create({
      estimatedGenerationsCount: 1,
      estimatedInputTokensPerGeneration: 1_000_000,
      estimatedOutputTokensPerGeneration: 0,
      workHours: 1,
      hourlyRate: "10",
    });
    const result = calculateEstimateBreakdown({ assumptions, modelPricing: MODEL_PRICING });
    expect(result.amount.currency).toBe("USD");
    expect(result.amount.toFixed()).toBe("15.000000"); // 5 (AI) + 10 (time)
    expect(result.breakdown).toHaveLength(2);
  });

  it("throws when no assumption produces any computable line (never a silent 0€ estimate)", () => {
    const assumptions = PricingAssumptions.create({});
    expect(() => calculateEstimateBreakdown({ assumptions })).toThrow();
  });
});
