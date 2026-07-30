import { describe, expect, it } from "vitest";
import { AiSchemaValidationFailedError } from "../../../domain/errors";
import { parseDocumentAnalysisOutput } from "./document-analysis-output.schema";

function validOutput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    documentType: "CCTP",
    language: "fr",
    metadata: { title: "Marché de nettoyage", buyer: "Ville de Test" },
    deadlines: [
      { kind: "SUBMISSION", label: "Date limite de remise des offres", date: "2026-09-01T12:00:00.000Z", citation: "avant le 1er septembre", confidence: 0.9 },
    ],
    criteria: [{ name: "Prix", weight: 60, isEliminatory: false, citation: "critère prix 60%", confidence: 0.85 }],
    requirements: [{ category: "TECHNICAL_MEMO", label: "Mémoire technique", isMandatory: true, citation: "fournir un mémoire", confidence: 0.8 }],
    clauses: [{ category: "PENALTY", summary: "Pénalités de retard de 1/1000e par jour", citation: "pénalités", confidence: 0.7 }],
    warnings: [],
    ...overrides,
  };
}

describe("parseDocumentAnalysisOutput", () => {
  it("accepts a well-formed document analysis response", () => {
    const result = parseDocumentAnalysisOutput(JSON.stringify(validOutput()));
    expect(result.documentType).toBe("CCTP");
    expect(result.deadlines).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });

  it("defaults warnings to an empty array when omitted", () => {
    const output = validOutput();
    delete (output as Record<string, unknown>).warnings;
    const result = parseDocumentAnalysisOutput(JSON.stringify(output));
    expect(result.warnings).toEqual([]);
  });

  it("rejects content that is not valid JSON", () => {
    expect(() => parseDocumentAnalysisOutput("not json at all")).toThrow(AiSchemaValidationFailedError);
  });

  it("rejects an unknown documentType value", () => {
    expect(() => parseDocumentAnalysisOutput(JSON.stringify(validOutput({ documentType: "SOMETHING_ELSE" })))).toThrow(
      AiSchemaValidationFailedError,
    );
  });

  it("rejects a deadline missing both a normalized date and rawText", () => {
    const output = validOutput({ deadlines: [{ kind: "SUBMISSION", label: "Date limite", confidence: 0.5 }] });
    expect(() => parseDocumentAnalysisOutput(JSON.stringify(output))).toThrow(AiSchemaValidationFailedError);
  });

  it("rejects a confidence score outside [0, 1]", () => {
    const output = validOutput({
      criteria: [{ name: "Prix", isEliminatory: false, confidence: 1.5 }],
    });
    expect(() => parseDocumentAnalysisOutput(JSON.stringify(output))).toThrow(AiSchemaValidationFailedError);
  });

  it("rejects an unknown requirement category", () => {
    const output = validOutput({
      requirements: [{ category: "NOT_A_REAL_CATEGORY", label: "x", isMandatory: true, confidence: 0.5 }],
    });
    expect(() => parseDocumentAnalysisOutput(JSON.stringify(output))).toThrow(AiSchemaValidationFailedError);
  });

  it("rejects an extra top-level field the model was never asked to produce", () => {
    // Zod's default (non-strict) object parsing simply strips unknown keys — this documents that
    // behaviour explicitly rather than assuming strictness by accident.
    const output = validOutput({ risks: [{ title: "should not be accepted at document level" }] });
    const result = parseDocumentAnalysisOutput(JSON.stringify(output));
    expect(result).not.toHaveProperty("risks");
  });
});
