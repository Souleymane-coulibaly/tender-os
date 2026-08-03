import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AiProvenanceValidationFailedError } from "../../domain/errors";
import {
  validateChunkProvenance,
  validateDocumentAnalysisProvenance,
  validateTenderConsolidationProvenance,
  type ChunksBySequence,
} from "./finding-provenance-validator";
import type { DocumentAnalysisOutput } from "../schemas/business/document-analysis-output.schema";
import type { TenderConsolidationOutput } from "../schemas/business/tender-consolidation-output.schema";

const CHUNKS: ChunksBySequence = new Map([
  [0, { content: "Le présent CCTP décrit la prestation de nettoyage des locaux.", pageStart: 1, pageEnd: 1, sectionTitle: "Objet" }],
  [1, { content: "La remise des offres a lieu avant le 1er septembre 2026.", pageStart: 2, pageEnd: 2, sectionTitle: "Délais" }],
]);

describe("validateChunkProvenance", () => {
  it("accepts an item with no provenance anchor at all (isInferred, un-sourceable fact)", () => {
    expect(() => validateChunkProvenance({}, CHUNKS)).not.toThrow();
  });

  it("accepts a citation that appears verbatim in the cited chunk", () => {
    expect(() => validateChunkProvenance({ chunkSequence: 0, citation: "prestation de nettoyage" }, CHUNKS)).not.toThrow();
  });

  it("rejects a chunkSequence that does not exist among the known chunks", () => {
    expect(() => validateChunkProvenance({ chunkSequence: 99 }, CHUNKS)).toThrow(AiProvenanceValidationFailedError);
  });

  it("rejects a citation that is not found verbatim in the cited chunk's content", () => {
    expect(() => validateChunkProvenance({ chunkSequence: 0, citation: "clause de résiliation anticipée" }, CHUNKS)).toThrow(
      AiProvenanceValidationFailedError,
    );
  });

  it("rejects a pageStart that contradicts the chunk's known page", () => {
    expect(() => validateChunkProvenance({ chunkSequence: 0, pageStart: 7 }, CHUNKS)).toThrow(AiProvenanceValidationFailedError);
  });

  it("rejects a sectionTitle that contradicts the chunk's known section", () => {
    expect(() => validateChunkProvenance({ chunkSequence: 1, sectionTitle: "Pénalités" }, CHUNKS)).toThrow(AiProvenanceValidationFailedError);
  });

  it("never contradicts a page/section the chunk simply does not carry (absence is not a contradiction)", () => {
    const chunksWithoutSheet: ChunksBySequence = new Map([[0, { content: "Contenu sans feuille ni page connues." }]]);
    expect(() => validateChunkProvenance({ chunkSequence: 0, pageStart: 3, sheetName: "Feuille 1" }, chunksWithoutSheet)).not.toThrow();
  });

  it("accepts a citation provided without chunkSequence when it is found in SOME known chunk (tolerant fallback)", () => {
    expect(() => validateChunkProvenance({ citation: "remise des offres" }, CHUNKS)).not.toThrow();
  });

  it("rejects a citation provided without chunkSequence when it is found in NO known chunk", () => {
    expect(() => validateChunkProvenance({ citation: "clause totalement inventée" }, CHUNKS)).toThrow(AiProvenanceValidationFailedError);
  });

  it("accepts a citation that only matches after whitespace/accent normalization — mission correctif rejets aléatoires confirmés en prod (retour à la ligne interne d'un chunk PDF restitué comme une phrase continue par le modèle)", () => {
    const chunksWithLineBreak: ChunksBySequence = new Map([
      [0, { content: "Le present marche a pour objet\nla fourniture de materiel informatique." }],
    ]);
    expect(() =>
      validateChunkProvenance({ chunkSequence: 0, citation: "Le présent marché a pour objet la fourniture de matériel informatique." }, chunksWithLineBreak),
    ).not.toThrow();
  });

  it("rejects a citation as fabricated (and never leaks the source text in the error message) when it does NOT match even after normalization", () => {
    try {
      validateChunkProvenance({ chunkSequence: 0, citation: "clause de résiliation anticipée totalement absente" }, CHUNKS);
      throw new Error("expected validateChunkProvenance to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AiProvenanceValidationFailedError);
      const message = (error as Error).message;
      expect(message).toContain("does not match even after whitespace/accent normalization");
      expect(message).not.toContain("résiliation anticipée");
    }
  });
});

describe("validateDocumentAnalysisProvenance", () => {
  function baseOutput(overrides: Partial<DocumentAnalysisOutput> = {}): DocumentAnalysisOutput {
    return {
      documentType: "CCTP",
      language: "fr",
      metadata: {},
      deadlines: [],
      criteria: [],
      requirements: [],
      clauses: [],
      warnings: [],
      ...overrides,
    };
  }

  it("validates every category (deadlines/criteria/requirements/clauses), not just the first one", () => {
    const output = baseOutput({
      deadlines: [{ kind: "SUBMISSION", label: "Remise des offres", chunkSequence: 1, isInferred: false, confidence: 0.9 }],
      clauses: [{ category: "PENALTY", summary: "x", chunkSequence: 42, isInferred: false, confidence: 0.5 }],
    });
    expect(() => validateDocumentAnalysisProvenance(output, CHUNKS)).toThrow(AiProvenanceValidationFailedError);
  });

  it("passes when every provenance is real", () => {
    const output = baseOutput({
      deadlines: [{ kind: "SUBMISSION", label: "Remise des offres", chunkSequence: 1, citation: "remise des offres", isInferred: false, confidence: 0.9 }],
    });
    expect(() => validateDocumentAnalysisProvenance(output, CHUNKS)).not.toThrow();
  });
});

describe("validateTenderConsolidationProvenance", () => {
  const DOC_A = randomUUID();
  const DOC_B = randomUUID();

  function baseOutput(overrides: Partial<TenderConsolidationOutput> = {}): TenderConsolidationOutput {
    return {
      metadata: {},
      deadlines: [],
      criteria: [],
      requirements: [],
      clauses: [],
      risks: [],
      questions: [],
      summary: {
        opportunitySummary: "x",
        complexityLevel: "LOW",
        mainCriteria: [],
        mainRisks: [],
        mainObligations: [],
        missingElements: [],
        pointsToClarify: [],
        conflicts: [],
        goNoGoRecommendation: "GO",
        goNoGoRationale: "x",
      },
      ...overrides,
    };
  }

  it("accepts a finding with no documentId and no chunkSequence (tender-wide, un-sourceable fact)", async () => {
    const output = baseOutput({ criteria: [{ name: "Prix", isEliminatory: false, isInferred: false, confidence: 0.5 }] });
    const resolveChunks = vi.fn();
    await expect(validateTenderConsolidationProvenance(output, { consolidatedDocumentIds: new Set([DOC_A]), resolveChunks })).resolves.toBeUndefined();
    expect(resolveChunks).not.toHaveBeenCalled();
  });

  it("rejects a chunkSequence provided without a documentId to resolve it against", async () => {
    const output = baseOutput({ criteria: [{ name: "Prix", isEliminatory: false, chunkSequence: 0, isInferred: false, confidence: 0.5 }] });
    await expect(
      validateTenderConsolidationProvenance(output, { consolidatedDocumentIds: new Set([DOC_A]), resolveChunks: vi.fn() }),
    ).rejects.toBeInstanceOf(AiProvenanceValidationFailedError);
  });

  it("rejects a documentId that was never consolidated for this tender — never even resolves its chunks", async () => {
    const foreignDocumentId = randomUUID();
    const output = baseOutput({
      risks: [
        {
          title: "x",
          category: "OTHER",
          severity: "LOW",
          explanation: "x",
          recommendation: "x",
          documentId: foreignDocumentId,
          isInferred: false,
          confidence: 0.5,
        },
      ],
    });
    const resolveChunks = vi.fn();
    await expect(
      validateTenderConsolidationProvenance(output, { consolidatedDocumentIds: new Set([DOC_A, DOC_B]), resolveChunks }),
    ).rejects.toBeInstanceOf(AiProvenanceValidationFailedError);
    expect(resolveChunks).not.toHaveBeenCalled();
  });

  it("resolves chunks only once per referenced document even if cited by multiple findings (memoized)", async () => {
    const resolveChunks = vi.fn(async () => CHUNKS);
    const output = baseOutput({
      criteria: [{ name: "Prix", isEliminatory: false, documentId: DOC_A, chunkSequence: 0, isInferred: false, confidence: 0.5 }],
      requirements: [
        { category: "TECHNICAL_MEMO", label: "x", isMandatory: true, documentId: DOC_A, chunkSequence: 1, isInferred: false, confidence: 0.5 },
      ],
    });

    await validateTenderConsolidationProvenance(output, { consolidatedDocumentIds: new Set([DOC_A]), resolveChunks });

    expect(resolveChunks).toHaveBeenCalledTimes(1);
    expect(resolveChunks).toHaveBeenCalledWith(DOC_A);
  });

  it("rejects a citation that cannot be found in the cited document's real chunk content", async () => {
    const output = baseOutput({
      questions: [
        {
          question: "x",
          justification: "x",
          priority: "LOW",
          theme: "x",
          documentId: DOC_A,
          chunkSequence: 0,
          citation: "clause totalement inventée",
          isInferred: false,
          confidence: 0.5,
        },
      ],
    });
    await expect(
      validateTenderConsolidationProvenance(output, { consolidatedDocumentIds: new Set([DOC_A]), resolveChunks: async () => CHUNKS }),
    ).rejects.toBeInstanceOf(AiProvenanceValidationFailedError);
  });
});
