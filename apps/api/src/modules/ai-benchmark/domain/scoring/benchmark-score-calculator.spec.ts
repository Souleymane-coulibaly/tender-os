import { describe, expect, it } from "vitest";
import { calculateGlobalScore, calculateRelativeCostLatencyEfficiency } from "./benchmark-score-calculator";

describe("calculateGlobalScore", () => {
  it("a perfect model on every quality dimension plus perfect cost/latency efficiency scores 1", () => {
    const score = calculateGlobalScore(
      { businessAccuracy: 1, hallucinationAbsence: 1, provenanceValidity: 1, completeness: 1, structuralConformity: 1 },
      1,
    );
    expect(score).toBeCloseTo(1, 6);
  });

  it("safety/reliability dimensions (accuracy+hallucination+provenance = 75%) outweigh cost (5%) — a model with perfect safety but zero cost efficiency still beats a model with perfect cost but weak safety", () => {
    const safeButExpensive = calculateGlobalScore(
      { businessAccuracy: 1, hallucinationAbsence: 1, provenanceValidity: 1, completeness: 1, structuralConformity: 1 },
      0,
    );
    const cheapButUnsafe = calculateGlobalScore(
      { businessAccuracy: 0.2, hallucinationAbsence: 0.2, provenanceValidity: 0.2, completeness: 0.2, structuralConformity: 0.2 },
      1,
    );
    expect(safeButExpensive).toBeGreaterThan(cheapButUnsafe);
  });

  it("a zero-quality model never scores above the cost/latency weight (5%)", () => {
    const score = calculateGlobalScore(
      { businessAccuracy: 0, hallucinationAbsence: 0, provenanceValidity: 0, completeness: 0, structuralConformity: 0 },
      1,
    );
    expect(score).toBeLessThanOrEqual(0.05 + 1e-9);
  });
});

describe("calculateRelativeCostLatencyEfficiency", () => {
  it("the cheapest and fastest model in the comparison set gets efficiency 1", () => {
    const efficiency = calculateRelativeCostLatencyEfficiency({
      cost: 1,
      latencyMs: 100,
      minCost: 1,
      maxCost: 5,
      minLatencyMs: 100,
      maxLatencyMs: 500,
    });
    expect(efficiency).toBeCloseTo(1, 6);
  });

  it("the most expensive and slowest model in the comparison set gets efficiency 0", () => {
    const efficiency = calculateRelativeCostLatencyEfficiency({
      cost: 5,
      latencyMs: 500,
      minCost: 1,
      maxCost: 5,
      minLatencyMs: 100,
      maxLatencyMs: 500,
    });
    expect(efficiency).toBeCloseTo(0, 6);
  });

  it("a single model being compared against itself gets efficiency 1 (no division by zero)", () => {
    const efficiency = calculateRelativeCostLatencyEfficiency({
      cost: 2,
      latencyMs: 200,
      minCost: 2,
      maxCost: 2,
      minLatencyMs: 200,
      maxLatencyMs: 200,
    });
    expect(efficiency).toBe(1);
  });
});
