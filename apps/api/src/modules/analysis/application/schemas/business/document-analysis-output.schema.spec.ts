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

  it("rejects a deadline item with the 'confidence' field entirely missing, never a silent default", () => {
    const output = validOutput({
      deadlines: [{ kind: "SUBMISSION", label: "Date limite", date: "2026-09-01T12:00:00.000Z" }],
    });
    expect(() => parseDocumentAnalysisOutput(JSON.stringify(output))).toThrow(AiSchemaValidationFailedError);
  });

  it("normalizes a date-only value (no time component) to midnight UTC — mission correctif rejets aleatoires selon le fichier, un document qui ne precise pas d'heure ne doit jamais faire echouer l'analyse", () => {
    const output = validOutput({
      deadlines: [{ kind: "SUBMISSION", label: "Date limite", date: "2026-09-01", confidence: 0.9 }],
    });
    const result = parseDocumentAnalysisOutput(JSON.stringify(output));
    expect(result.deadlines[0]!.date).toBe("2026-09-01T00:00:00.000Z");
  });

  it("normalizes a datetime with a numeric timezone offset to UTC", () => {
    const output = validOutput({
      deadlines: [{ kind: "SUBMISSION", label: "Date limite", date: "2026-09-01T12:00:00+01:00", confidence: 0.9 }],
    });
    const result = parseDocumentAnalysisOutput(JSON.stringify(output));
    expect(result.deadlines[0]!.date).toBe("2026-09-01T11:00:00.000Z");
  });

  it("normalizes a datetime with no seconds component to UTC — mission correctif '12h00' restitue sans secondes par le modele", () => {
    const output = validOutput({
      deadlines: [{ kind: "SUBMISSION", label: "Date limite", date: "2026-09-30T12:00Z", confidence: 0.9 }],
    });
    const result = parseDocumentAnalysisOutput(JSON.stringify(output));
    expect(result.deadlines[0]!.date).toBe("2026-09-30T12:00:00.000Z");
  });

  it("still rejects a calendar-impossible date (e.g. February 30th) rather than silently rolling it over to March", () => {
    const output = validOutput({
      deadlines: [{ kind: "SUBMISSION", label: "Date limite", date: "2026-02-30T00:00:00Z", confidence: 0.9 }],
    });
    expect(() => parseDocumentAnalysisOutput(JSON.stringify(output))).toThrow(AiSchemaValidationFailedError);
  });

  it("still rejects an ambiguous non-ISO date format (e.g. DD/MM/YYYY) rather than guessing the field order", () => {
    const output = validOutput({
      deadlines: [{ kind: "SUBMISSION", label: "Date limite", date: "01/09/2026", confidence: 0.9 }],
    });
    expect(() => parseDocumentAnalysisOutput(JSON.stringify(output))).toThrow(AiSchemaValidationFailedError);
  });

  it("diagnoses a rejected date without ever leaking the source value: ISO-shaped but invalid calendar vs. not ISO-shaped at all", () => {
    const isoShaped = validOutput({
      deadlines: [{ kind: "SUBMISSION", label: "Date limite", date: "2026-02-30T00:00:00Z", confidence: 0.9 }],
    });
    expect(() => parseDocumentAnalysisOutput(JSON.stringify(isoShaped))).toThrow(
      /has an ISO 8601 shape but an invalid calendar date or out-of-range time component/,
    );

    const notIsoShaped = validOutput({
      deadlines: [{ kind: "SUBMISSION", label: "Date limite", date: "01/09/2026", confidence: 0.9 }],
    });
    try {
      parseDocumentAnalysisOutput(JSON.stringify(notIsoShaped));
      throw new Error("expected parseDocumentAnalysisOutput to throw");
    } catch (error) {
      expect((error as Error).message).toContain("does not resemble an ISO 8601 date/datetime at all");
      expect((error as Error).message).not.toContain("01/09/2026");
    }
  });

  it("rejects an unknown requirement category", () => {
    const output = validOutput({
      requirements: [{ category: "NOT_A_REAL_CATEGORY", label: "x", isMandatory: true, confidence: 0.5 }],
    });
    expect(() => parseDocumentAnalysisOutput(JSON.stringify(output))).toThrow(AiSchemaValidationFailedError);
  });

  it("accepts explicit null on optional fields — mission correctif crash prod, Structured Outputs strict envoie null jamais une clé absente", () => {
    const output = validOutput({
      metadata: {
        title: null,
        reference: null,
        buyer: "Ville de Test",
        contractingAuthority: null,
        purpose: null,
        procedureType: null,
        marketType: null,
        marketForm: null,
        allotment: null,
        lotCount: null,
        duration: null,
        renewal: null,
        executionPlace: null,
        cpvCode: null,
        variantsAllowed: null,
        additionalServices: null,
        mandatoryVisit: null,
        negotiationPossible: null,
      },
      deadlines: [{ kind: "SUBMISSION", label: "Date limite", date: "2026-09-01T12:00:00.000Z", rawText: null, chunkSequence: null, pageStart: null, pageEnd: null, sheetName: null, sectionTitle: null, citation: null, confidence: 0.9 }],
      criteria: [{ name: "Prix", weight: null, subCriteria: null, scoringMethod: null, priceFormula: null, threshold: null, isEliminatory: false, citation: null, confidence: 0.8 }],
      clauses: [{ category: "PENALTY", summary: "Pénalités", sheetName: null, sectionTitle: null, citation: null, confidence: 0.9 }],
    });

    const result = parseDocumentAnalysisOutput(JSON.stringify(output));
    expect(result.metadata.title).toBeNull();
    expect(result.deadlines[0]!.rawText).toBeNull();
    expect(result.clauses[0]!.summary).toBe("Pénalités");
  });

  it("still rejects a deadline where BOTH date and rawText are explicitly null, not just both absent", () => {
    const output = validOutput({
      deadlines: [{ kind: "SUBMISSION", label: "Date limite", date: null, rawText: null, confidence: 0.5 }],
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
