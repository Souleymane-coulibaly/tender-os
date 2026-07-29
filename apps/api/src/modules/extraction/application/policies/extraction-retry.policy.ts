import { DocumentExtractionStatus } from "../../domain/document-extraction-status";
import type { DocumentExtraction } from "../../domain/document-extraction.aggregate";
import { ExtractionNotRetryableError, ExtractionRetryLimitExceededError } from "../../domain/extraction-errors";

/**
 * Mission Sprint 3 §16 — jamais un retry indéfini : `maxRetries` borne le nombre de tentatives
 * SUPPLÉMENTAIRES après la première (donc `1 + maxRetries` tentatives au total). Seul un statut
 * FAILED peut être relancé — un succès (même partiel) ou NOT_PROCESSABLE ne se relance jamais
 * (voir DocumentExtractionStatus, ALLOWED_DOCUMENT_EXTRACTION_TRANSITIONS : FAILED est la seule
 * origine autorisée vers READY).
 */
export function assertExtractionIsRetryable(extraction: DocumentExtraction, maxRetries: number): void {
  if (extraction.status !== DocumentExtractionStatus.Failed) {
    throw new ExtractionNotRetryableError({ status: extraction.status });
  }
  if (extraction.attemptCount >= 1 + maxRetries) {
    throw new ExtractionRetryLimitExceededError({ maxAttempts: 1 + maxRetries });
  }
}
