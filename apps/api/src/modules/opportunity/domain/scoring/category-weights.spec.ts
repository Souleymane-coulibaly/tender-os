import { describe, expect, it } from "vitest";
import { computeWeightedGlobalScore, LEVEL_1_CATEGORY_WEIGHTS, LEVEL_2_CATEGORY_WEIGHTS, RECOMMENDATION_THRESHOLDS } from "./category-weights";

describe("category weights", () => {
  it("Level 1 weights (8 categories) sum to exactly 100", () => {
    expect(Object.values(LEVEL_1_CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("Level 2 weights (7 categories) sum to exactly 100", () => {
    expect(Object.values(LEVEL_2_CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("thresholds are ordered GO > GO_CONDITIONAL", () => {
    expect(RECOMMENDATION_THRESHOLDS.go).toBeGreaterThan(RECOMMENDATION_THRESHOLDS.goConditional);
  });
});

describe("computeWeightedGlobalScore", () => {
  it("returns a plain weighted average, never a flat arithmetic mean", () => {
    const score = computeWeightedGlobalScore(
      new Map([
        ["a", { score: 100, weight: 80 }],
        ["b", { score: 0, weight: 20 }],
      ]),
    );
    // Moyenne arithmétique simple donnerait 50 — la pondération doit rapprocher le résultat de 100.
    expect(score).toBe(80);
  });

  it("returns 0 when total weight is 0, never NaN/Infinity", () => {
    expect(computeWeightedGlobalScore(new Map())).toBe(0);
  });

  it("rounds to 2 decimals", () => {
    const score = computeWeightedGlobalScore(
      new Map([
        ["a", { score: 33, weight: 1 }],
        ["b", { score: 67, weight: 2 }],
      ]),
    );
    expect(score).toBe(Math.round(score * 100) / 100);
  });
});
