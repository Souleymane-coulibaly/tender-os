import { describe, expect, it } from "vitest";
import { EliminationReason } from "./elimination-reason";
import { applyHardEliminationRules } from "./hard-elimination-rules";

const BASE = {
  tenantLeakageDetected: false,
  invalidProvenanceDetected: false,
  criticalHallucinationDetected: false,
  invalidJsonRate: 0,
  failureRate: 0,
  averageQualityScore: 0.9,
};

describe("applyHardEliminationRules", () => {
  it("admits a model with no red flags and quality above the threshold", () => {
    expect(applyHardEliminationRules(BASE)).toBeNull();
  });

  it("eliminates on tenant/client leakage regardless of an otherwise perfect score", () => {
    expect(applyHardEliminationRules({ ...BASE, tenantLeakageDetected: true, averageQualityScore: 1 })).toBe(
      EliminationReason.TenantLeakage,
    );
  });

  it("eliminates on invalid provenance regardless of score", () => {
    expect(applyHardEliminationRules({ ...BASE, invalidProvenanceDetected: true, averageQualityScore: 1 })).toBe(
      EliminationReason.InvalidProvenance,
    );
  });

  it("eliminates on critical hallucination regardless of score", () => {
    expect(applyHardEliminationRules({ ...BASE, criticalHallucinationDetected: true, averageQualityScore: 1 })).toBe(
      EliminationReason.CriticalHallucination,
    );
  });

  it("eliminates when the invalid-JSON rate exceeds the threshold, even with a perfect quality score on the valid attempts", () => {
    expect(applyHardEliminationRules({ ...BASE, invalidJsonRate: 0.6, averageQualityScore: 1 })).toBe(
      EliminationReason.InvalidJsonRateTooHigh,
    );
  });

  it("eliminates when the failure rate exceeds the threshold", () => {
    expect(applyHardEliminationRules({ ...BASE, failureRate: 0.6, averageQualityScore: 1 })).toBe(
      EliminationReason.FailureRateTooHigh,
    );
  });

  it("eliminates a model whose average quality score is below the minimum threshold, no matter how cheap it is (correction — a cheap model never wins on cost alone)", () => {
    expect(applyHardEliminationRules({ ...BASE, averageQualityScore: 0.1 })).toBe(EliminationReason.QualityBelowThreshold);
  });
});
