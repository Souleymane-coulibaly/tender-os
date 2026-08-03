import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AiSchemaValidationFailedError } from "../../../domain/errors";
import { parseTenderConsolidationOutput } from "./tender-consolidation-output.schema";

const DOC_ID = randomUUID();

function validOutput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    metadata: { title: "Marché de nettoyage" },
    deadlines: [
      { kind: "SUBMISSION", label: "Date limite de remise des offres", date: "2026-09-01T12:00:00.000Z", documentId: DOC_ID, confidence: 0.9 },
    ],
    criteria: [{ name: "Prix", weight: 60, isEliminatory: false, documentId: DOC_ID, confidence: 0.85 }],
    requirements: [{ category: "TECHNICAL_MEMO", label: "Mémoire technique", isMandatory: true, documentId: DOC_ID, confidence: 0.8 }],
    clauses: [{ category: "PENALTY", summary: "Pénalités de retard", documentId: DOC_ID, confidence: 0.7 }],
    risks: [
      {
        title: "Délai de réponse très court",
        category: "PLANNING",
        severity: "HIGH",
        explanation: "Le délai entre la publication et la remise est inférieur à 3 semaines.",
        recommendation: "Prioriser la rédaction du mémoire technique dès maintenant.",
        documentId: DOC_ID,
        confidence: 0.75,
      },
    ],
    questions: [
      {
        question: "Le DPGF doit-il être remis au format Excel natif ?",
        justification: "Le CCAP ne précise pas le format attendu pour le DPGF.",
        priority: "MEDIUM",
        theme: "Pièces à fournir",
        documentId: DOC_ID,
        confidence: 0.6,
      },
    ],
    summary: {
      opportunitySummary: "Marché de nettoyage de locaux tertiaires, complexité modérée.",
      complexityLevel: "MEDIUM",
      mainCriteria: ["Prix (60%)"],
      mainRisks: ["Délai court"],
      mainObligations: ["Mémoire technique obligatoire"],
      missingElements: [],
      pointsToClarify: ["Format du DPGF"],
      conflicts: [],
      goNoGoRecommendation: "GO_WITH_RESERVATIONS",
      goNoGoRationale: "Opportunité cohérente avec le profil de l'entreprise malgré un délai court.",
    },
    ...overrides,
  };
}

describe("parseTenderConsolidationOutput", () => {
  it("accepts a well-formed tender consolidation response", () => {
    const result = parseTenderConsolidationOutput(JSON.stringify(validOutput()));
    expect(result.risks).toHaveLength(1);
    expect(result.summary.goNoGoRecommendation).toBe("GO_WITH_RESERVATIONS");
  });

  it("defaults summary.conflicts to an empty array when omitted", () => {
    const output = validOutput();
    const summary = output.summary as Record<string, unknown>;
    delete summary.conflicts;
    const result = parseTenderConsolidationOutput(JSON.stringify(output));
    expect(result.summary.conflicts).toEqual([]);
  });

  it("rejects content that is not valid JSON", () => {
    expect(() => parseTenderConsolidationOutput("not json at all")).toThrow(AiSchemaValidationFailedError);
  });

  it("rejects an unknown risk severity", () => {
    const output = validOutput({
      risks: [
        {
          title: "x",
          category: "OTHER",
          severity: "EXTREME",
          explanation: "x",
          recommendation: "x",
          documentId: DOC_ID,
          confidence: 0.5,
        },
      ],
    });
    expect(() => parseTenderConsolidationOutput(JSON.stringify(output))).toThrow(AiSchemaValidationFailedError);
  });

  it("rejects an unknown goNoGoRecommendation value — never a free-form decision string", () => {
    const output = validOutput();
    (output.summary as Record<string, unknown>).goNoGoRecommendation = "DEFINITELY_YES";
    expect(() => parseTenderConsolidationOutput(JSON.stringify(output))).toThrow(AiSchemaValidationFailedError);
  });

  it("rejects a non-uuid documentId in a finding's provenance", () => {
    const output = validOutput({
      criteria: [{ name: "Prix", isEliminatory: false, documentId: "not-a-uuid", confidence: 0.5 }],
    });
    expect(() => parseTenderConsolidationOutput(JSON.stringify(output))).toThrow(AiSchemaValidationFailedError);
  });

  it("rejects a missing summary object entirely", () => {
    const output = validOutput();
    delete (output as Record<string, unknown>).summary;
    expect(() => parseTenderConsolidationOutput(JSON.stringify(output))).toThrow(AiSchemaValidationFailedError);
  });

  it("rejects a risk item with the 'confidence' field entirely missing, never a silent default", () => {
    const output = validOutput({
      risks: [
        {
          title: "Délai de réponse très court",
          category: "PLANNING",
          severity: "HIGH",
          explanation: "Le délai entre la publication et la remise est inférieur à 3 semaines.",
          recommendation: "Prioriser la rédaction du mémoire technique dès maintenant.",
          documentId: DOC_ID,
        },
      ],
    });
    expect(() => parseTenderConsolidationOutput(JSON.stringify(output))).toThrow(AiSchemaValidationFailedError);
  });
});
