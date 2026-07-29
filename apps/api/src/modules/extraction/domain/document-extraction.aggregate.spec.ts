import { describe, expect, it } from "vitest";
import { DocumentExtraction } from "./document-extraction.aggregate";
import { DocumentExtractionStatus } from "./document-extraction-status";
import { DocumentExtractionStrategy } from "./document-extraction-strategy";
import { InvalidExtractionStatusTransitionError } from "./extraction-errors";

const NOW = new Date("2026-07-27T10:00:00Z");
const LATER = new Date("2026-07-27T10:05:00Z");

function createPending(): DocumentExtraction {
  return DocumentExtraction.create({
    documentId: "doc-1",
    dceId: "dce-1",
    organizationId: "org-1",
    occurredAt: NOW,
  });
}

describe("DocumentExtraction", () => {
  it("starts in PENDING with attemptCount 0 and no strategy", () => {
    const extraction = createPending();
    expect(extraction.status).toBe(DocumentExtractionStatus.Pending);
    expect(extraction.attemptCount).toBe(0);
    expect(extraction.strategy).toBeUndefined();
  });

  it("walks the funnel PENDING -> PROCESSING (reserve) -> SUCCEEDED (complete), incrementing attemptCount exactly once", () => {
    const extraction = createPending();

    extraction.reserve(NOW);
    expect(extraction.status).toBe(DocumentExtractionStatus.Processing);
    expect(extraction.attemptCount).toBe(1);
    // La stratégie n'est pas encore connue à la réservation (correction P1-02 — elle est
    // déterminée hors transaction, entre la réservation et la finalisation).
    expect(extraction.strategy).toBeUndefined();

    extraction.complete(
      {
        outcome: DocumentExtractionStatus.Succeeded,
        strategy: DocumentExtractionStrategy.NativeText,
        characterCount: 120,
        chunkCount: 3,
        warnings: [],
      },
      LATER,
    );
    expect(extraction.status).toBe(DocumentExtractionStatus.Succeeded);
    expect(extraction.strategy).toBe(DocumentExtractionStrategy.NativeText);
    expect(extraction.characterCount).toBe(120);
    expect(extraction.chunkCount).toBe(3);
    expect(extraction.lastError).toBeUndefined();
    expect(extraction.updatedAt).toEqual(LATER);
  });

  it("also reserves directly from READY (retry path), incrementing attemptCount again", () => {
    const extraction = createPending();
    extraction.reserve(NOW);
    extraction.fail({ reason: "boom" }, NOW);
    extraction.resetForRetry(LATER);
    expect(extraction.status).toBe(DocumentExtractionStatus.Ready);

    extraction.reserve(LATER);
    expect(extraction.status).toBe(DocumentExtractionStatus.Processing);
    expect(extraction.attemptCount).toBe(2);
  });

  it("marks NOT_PROCESSABLE from PROCESSING for an unsupported format, a terminal state", () => {
    const extraction = createPending();
    extraction.reserve(NOW);
    extraction.markNotProcessable(NOW);
    expect(extraction.status).toBe(DocumentExtractionStatus.NotProcessable);
    expect(() => extraction.reserve(NOW)).toThrow(InvalidExtractionStatusTransitionError);
  });

  it("fails from PROCESSING and records the reason and, when known, the strategy", () => {
    const extraction = createPending();
    extraction.reserve(NOW);
    extraction.fail({ reason: "OCR provider unavailable", strategy: DocumentExtractionStrategy.Ocr }, LATER);
    expect(extraction.status).toBe(DocumentExtractionStatus.Failed);
    expect(extraction.lastError).toBe("OCR provider unavailable");
    expect(extraction.strategy).toBe(DocumentExtractionStrategy.Ocr);
  });

  it("fails from PROCESSING without a known strategy when the failure happened before it could be determined", () => {
    const extraction = createPending();
    extraction.reserve(NOW);
    extraction.fail({ reason: "file not found" }, NOW);
    expect(extraction.status).toBe(DocumentExtractionStatus.Failed);
    expect(extraction.strategy).toBeUndefined();
  });

  it("allows a retry only from FAILED, resetting to READY and clearing lastError", () => {
    const extraction = createPending();
    extraction.reserve(NOW);
    extraction.fail({ reason: "timeout", strategy: DocumentExtractionStrategy.Ocr }, NOW);

    extraction.resetForRetry(LATER);
    expect(extraction.status).toBe(DocumentExtractionStatus.Ready);
    expect(extraction.lastError).toBeUndefined();

    // Un second cycle incrémente encore attemptCount (mission §16 — chaque tentative, y compris
    // un retry, laisse une trace distincte).
    extraction.reserve(LATER);
    expect(extraction.attemptCount).toBe(2);
  });

  it("never allows a retry directly from a successful terminal state", () => {
    const extraction = createPending();
    extraction.reserve(NOW);
    extraction.complete(
      { outcome: DocumentExtractionStatus.Succeeded, strategy: DocumentExtractionStrategy.NativeText, warnings: [] },
      NOW,
    );
    expect(() => extraction.resetForRetry(LATER)).toThrow(InvalidExtractionStatusTransitionError);
  });

  it("never allows a retry directly from NOT_PROCESSABLE", () => {
    const extraction = createPending();
    extraction.reserve(NOW);
    extraction.markNotProcessable(NOW);
    expect(() => extraction.resetForRetry(LATER)).toThrow(InvalidExtractionStatusTransitionError);
  });

  it("rehydrates from persisted props without re-running the funnel", () => {
    const extraction = DocumentExtraction.rehydrate({
      documentId: "doc-2",
      dceId: "dce-2",
      organizationId: "org-2",
      status: DocumentExtractionStatus.Succeeded,
      strategy: DocumentExtractionStrategy.Spreadsheet,
      attemptCount: 1,
      characterCount: 500,
      chunkCount: 2,
      warnings: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(extraction.status).toBe(DocumentExtractionStatus.Succeeded);
    expect(extraction.strategy).toBe(DocumentExtractionStrategy.Spreadsheet);
  });
});
