import { describe, expect, it } from "vitest";
import { DocumentExtraction } from "../../domain/document-extraction.aggregate";
import { DocumentExtractionStrategy } from "../../domain/document-extraction-strategy";
import { ExtractionNotRetryableError, ExtractionRetryLimitExceededError } from "../../domain/extraction-errors";
import { assertExtractionIsRetryable } from "./extraction-retry.policy";

const NOW = new Date("2026-07-27T10:00:00Z");

function failedExtractionWithAttempts(attemptCount: number): DocumentExtraction {
  const extraction = DocumentExtraction.create({ documentId: "doc-1", dceId: "dce-1", organizationId: "org-1", occurredAt: NOW });
  for (let i = 0; i < attemptCount; i += 1) {
    extraction.reserve(NOW);
    extraction.fail({ reason: "boom", strategy: DocumentExtractionStrategy.Ocr }, NOW);
    if (i < attemptCount - 1) {
      extraction.resetForRetry(NOW);
    }
  }
  return extraction;
}

describe("assertExtractionIsRetryable", () => {
  it("allows a retry when the extraction is FAILED and under the retry limit", () => {
    const extraction = failedExtractionWithAttempts(1);
    expect(() => assertExtractionIsRetryable(extraction, 2)).not.toThrow();
  });

  it("rejects a retry for any non-FAILED status", () => {
    const extraction = DocumentExtraction.create({ documentId: "doc-1", dceId: "dce-1", organizationId: "org-1", occurredAt: NOW });
    expect(() => assertExtractionIsRetryable(extraction, 2)).toThrow(ExtractionNotRetryableError);
  });

  it("rejects a retry once attemptCount reaches 1 + maxRetries — never retries indefinitely", () => {
    const extraction = failedExtractionWithAttempts(3);
    expect(() => assertExtractionIsRetryable(extraction, 2)).toThrow(ExtractionRetryLimitExceededError);
  });
});
