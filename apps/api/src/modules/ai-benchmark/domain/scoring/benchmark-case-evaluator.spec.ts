import { describe, expect, it } from "vitest";
import { evaluateBenchmarkCaseOutput } from "./benchmark-case-evaluator";

describe("evaluateBenchmarkCaseOutput", () => {
  it("scores 0 on every dimension for invalid JSON, without throwing", () => {
    const evaluation = evaluateBenchmarkCaseOutput({
      rawOutput: "not json at all {{{",
      expectedOutput: { submissionDeadline: "2026-09-30T12:00:00+02:00" },
    });

    expect(evaluation.jsonValid).toBe(false);
    expect(evaluation.dimensions.structuralConformity).toBe(0);
    expect(evaluation.dimensions.businessAccuracy).toBe(0);
  });

  it("scores full marks when the output exactly matches the expected fields", () => {
    const evaluation = evaluateBenchmarkCaseOutput({
      rawOutput: JSON.stringify({ submissionDeadline: "2026-09-30T12:00:00+02:00" }),
      expectedOutput: { submissionDeadline: "2026-09-30T12:00:00+02:00" },
    });

    expect(evaluation.jsonValid).toBe(true);
    expect(evaluation.dimensions.businessAccuracy).toBe(1);
    expect(evaluation.dimensions.completeness).toBe(1);
    expect(evaluation.dimensions.hallucinationAbsence).toBe(1);
  });

  it("correctly scores a case where the expected value is an explicit absence (null)", () => {
    const matching = evaluateBenchmarkCaseOutput({
      rawOutput: JSON.stringify({ submissionDeadline: null }),
      expectedOutput: { submissionDeadline: null },
    });
    expect(matching.dimensions.businessAccuracy).toBe(1);
    expect(matching.dimensions.hallucinationAbsence).toBe(1);

    const hallucinated = evaluateBenchmarkCaseOutput({
      rawOutput: JSON.stringify({ submissionDeadline: "2026-01-01T00:00:00Z" }),
      expectedOutput: { submissionDeadline: null },
    });
    expect(hallucinated.dimensions.hallucinationAbsence).toBeLessThan(1);
  });

  it("flags a critical hallucination when the majority of expected-absent/extra fields are invented", () => {
    const evaluation = evaluateBenchmarkCaseOutput({
      rawOutput: JSON.stringify({ a: "invented", b: "invented", c: "invented" }),
      expectedOutput: { a: null },
    });
    expect(evaluation.criticalHallucinationDetected).toBe(true);
  });

  it("penalizes partial matches proportionally (completeness vs accuracy)", () => {
    const evaluation = evaluateBenchmarkCaseOutput({
      rawOutput: JSON.stringify({ criteria: "wrong value", totalWeight: 100 }),
      expectedOutput: { criteria: "expected value", totalWeight: 100 },
    });
    expect(evaluation.dimensions.completeness).toBe(1); // both keys present
    expect(evaluation.dimensions.businessAccuracy).toBe(0.5); // only 1 of 2 matches
  });

  it("checks provenance separately when expectedProvenance is declared, and is neutral (1) when it isn't", () => {
    const withoutProvenance = evaluateBenchmarkCaseOutput({
      rawOutput: JSON.stringify({ x: 1 }),
      expectedOutput: { x: 1 },
    });
    expect(withoutProvenance.dimensions.provenanceValidity).toBe(1);
    expect(withoutProvenance.invalidProvenanceDetected).toBe(false);

    const withValidProvenance = evaluateBenchmarkCaseOutput({
      rawOutput: JSON.stringify({ x: 1, provenance: { documentId: "doc-1" } }),
      expectedOutput: { x: 1 },
      expectedProvenance: { documentId: "doc-1" },
    });
    expect(withValidProvenance.dimensions.provenanceValidity).toBe(1);
    expect(withValidProvenance.invalidProvenanceDetected).toBe(false);

    const withInvalidProvenance = evaluateBenchmarkCaseOutput({
      rawOutput: JSON.stringify({ x: 1, provenance: { documentId: "wrong-doc" } }),
      expectedOutput: { x: 1 },
      expectedProvenance: { documentId: "doc-1" },
    });
    expect(withInvalidProvenance.invalidProvenanceDetected).toBe(true);
  });

  it("never throws regardless of the shape of expectedOutput or the raw output", () => {
    expect(() => evaluateBenchmarkCaseOutput({ rawOutput: "[]", expectedOutput: { x: 1 } })).not.toThrow();
    expect(() => evaluateBenchmarkCaseOutput({ rawOutput: "null", expectedOutput: { x: 1 } })).not.toThrow();
    expect(() => evaluateBenchmarkCaseOutput({ rawOutput: "42", expectedOutput: { x: 1 } })).not.toThrow();
  });
});
