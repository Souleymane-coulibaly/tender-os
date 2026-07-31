import { describe, expect, it } from "vitest";
import { BenchmarkCaseResult } from "../../domain/benchmark-case-result.entity";
import { aggregateBenchmarkRunResultsByModel } from "./aggregate-benchmark-run-results";

const NOW = new Date("2026-07-30T10:00:00Z");

function result(overrides: Partial<Parameters<typeof BenchmarkCaseResult.create>[0]>) {
  return BenchmarkCaseResult.create({
    id: overrides.id ?? "result-1",
    runId: "run-1",
    caseId: overrides.caseId ?? "case-1",
    aiModelId: overrides.aiModelId ?? "model-1",
    repetitionIndex: overrides.repetitionIndex ?? 1,
    evaluationPassed: overrides.evaluationPassed ?? true,
    evaluationScore: overrides.evaluationScore ?? 0.9,
    evaluationDetails: overrides.evaluationDetails ?? {},
    actualCostAmount: overrides.actualCostAmount ?? "0.01",
    durationMs: overrides.durationMs ?? 100,
    createdAt: NOW,
    ...overrides,
  });
}

describe("aggregateBenchmarkRunResultsByModel", () => {
  it("groups results by model and computes averages", () => {
    const results = [
      result({ id: "r1", aiModelId: "model-a", evaluationScore: 0.8, actualCostAmount: "0.02", durationMs: 200 }),
      result({ id: "r2", aiModelId: "model-a", evaluationScore: 0.9, actualCostAmount: "0.03", durationMs: 300 }),
      result({ id: "r3", aiModelId: "model-b", evaluationScore: 0.5, actualCostAmount: "0.01", durationMs: 100 }),
    ];

    const comparisons = aggregateBenchmarkRunResultsByModel(results);
    const modelA = comparisons.find((c) => c.aiModelId === "model-a")!;
    const modelB = comparisons.find((c) => c.aiModelId === "model-b")!;

    expect(modelA.caseResultCount).toBe(2);
    expect(modelB.caseResultCount).toBe(1);
  });

  it("the cheaper/faster model never wins the final score if its quality is far behind (safety > cost)", () => {
    const results = [
      result({ id: "r1", aiModelId: "expensive-but-safe", evaluationScore: 0.95, actualCostAmount: "0.05", durationMs: 500 }),
      result({ id: "r2", aiModelId: "cheap-but-unsafe", evaluationScore: 0.3, actualCostAmount: "0.001", durationMs: 50 }),
    ];

    const comparisons = aggregateBenchmarkRunResultsByModel(results);
    const safe = comparisons.find((c) => c.aiModelId === "expensive-but-safe")!;
    const unsafe = comparisons.find((c) => c.aiModelId === "cheap-but-unsafe")!;

    expect(safe.averageScore).toBeGreaterThan(unsafe.averageScore);
  });

  it("marks a model eliminated when its average quality is below the minimum threshold, and never as a winner", () => {
    const results = [
      result({ id: "r1", aiModelId: "bad-model", evaluationScore: 0.1, actualCostAmount: "0.001", durationMs: 50 }),
      result({ id: "r2", aiModelId: "good-model", evaluationScore: 0.9, actualCostAmount: "0.05", durationMs: 500 }),
    ];

    const comparisons = aggregateBenchmarkRunResultsByModel(results);
    const bad = comparisons.find((c) => c.aiModelId === "bad-model")!;
    expect(bad.eliminated).toBe(true);
    expect(bad.eliminationReason).toBe("QUALITY_BELOW_THRESHOLD");
  });

  it("marks a model eliminated when its critical-hallucination flag was raised on any result", () => {
    const results = [
      result({
        id: "r1",
        aiModelId: "hallucinating-model",
        evaluationScore: 0.9,
        eliminationSignal: { criticalHallucination: true, invalidProvenance: false },
      }),
    ];

    const comparisons = aggregateBenchmarkRunResultsByModel(results);
    expect(comparisons[0]!.eliminated).toBe(true);
    expect(comparisons[0]!.eliminationReason).toBe("CRITICAL_HALLUCINATION");
  });

  it("counts errored results toward the failure rate", () => {
    const results = [
      result({ id: "r1", aiModelId: "flaky-model", errorCode: "AI_TIMEOUT", evaluationScore: 0, evaluationPassed: false }),
      result({ id: "r2", aiModelId: "flaky-model", evaluationScore: 0.9 }),
    ];

    const comparisons = aggregateBenchmarkRunResultsByModel(results);
    expect(comparisons[0]!.failureRate).toBeCloseTo(0.5, 6);
  });
});
