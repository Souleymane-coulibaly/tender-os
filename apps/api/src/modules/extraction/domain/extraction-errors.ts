import { DomainError } from "../../../shared-kernel/domain-error";

export class InvalidDocumentExtractionStatusError extends DomainError {
  readonly code = "INVALID_DOCUMENT_EXTRACTION_STATUS";
  constructor(value: string) {
    super(`"${value}" is not a valid document extraction status.`);
  }
}

export class InvalidExtractionStatusTransitionError extends DomainError {
  readonly code = "INVALID_EXTRACTION_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition document extraction from ${input.from} to ${input.to}.`);
  }
}

export class DocumentExtractionNotFoundError extends DomainError {
  readonly code = "DOCUMENT_EXTRACTION_NOT_FOUND";
  constructor() {
    super("Document extraction not found.");
  }
}

export class ExtractionPermissionMissingError extends DomainError {
  readonly code = "EXTRACTION_PERMISSION_MISSING";
  constructor(input: { permission: string }) {
    super(`Missing permission: ${input.permission}.`);
  }
}

/** Mission §16 — un document ne doit jamais être traité deux fois simultanément. */
export class ExtractionAlreadyRunningError extends DomainError {
  readonly code = "EXTRACTION_ALREADY_RUNNING";
  constructor() {
    super("An extraction is already running for this document.");
  }
}

export class UnsupportedDocumentFormatError extends DomainError {
  readonly code = "UNSUPPORTED_DOCUMENT_FORMAT";
  constructor(input: { extension: string }) {
    super(`"${input.extension}" has no supported extraction strategy.`);
  }
}

export class EncryptedPdfError extends DomainError {
  readonly code = "ENCRYPTED_PDF";
  constructor() {
    super("This PDF is password-protected and cannot be extracted without user action.");
  }
}

export class CorruptedDocumentError extends DomainError {
  readonly code = "CORRUPTED_DOCUMENT";
  constructor(input: { reason: string }) {
    super(`The document appears to be corrupted: ${input.reason}.`);
  }
}

export class ExtractionTimeoutError extends DomainError {
  readonly code = "EXTRACTION_TIMEOUT";
  constructor(input: { timeoutMs: number }) {
    super(`Extraction exceeded the configured timeout (${input.timeoutMs}ms).`);
  }
}

export class OcrProviderUnavailableError extends DomainError {
  readonly code = "OCR_PROVIDER_UNAVAILABLE";
  constructor(input: { reason: string }) {
    super(`The OCR provider is unavailable: ${input.reason}.`);
  }
}

export class ExtractionFailedError extends DomainError {
  readonly code = "EXTRACTION_FAILED";
  constructor(input: { reason: string }) {
    super(`Extraction failed: ${input.reason}.`);
  }
}

export class ExtractionResultInvalidError extends DomainError {
  readonly code = "EXTRACTION_RESULT_INVALID";
  constructor(input: { reason: string }) {
    super(`Extraction produced an invalid result: ${input.reason}.`);
  }
}

/** Mission §16 — jamais retry indéfiniment. */
export class ExtractionRetryLimitExceededError extends DomainError {
  readonly code = "EXTRACTION_RETRY_LIMIT_EXCEEDED";
  constructor(input: { maxAttempts: number }) {
    super(`Extraction has already been attempted ${input.maxAttempts} time(s); no further retry is allowed.`);
  }
}

export class ExtractionNotRetryableError extends DomainError {
  readonly code = "EXTRACTION_NOT_RETRYABLE";
  constructor(input: { status: string }) {
    super(`Extraction in status "${input.status}" cannot be retried.`);
  }
}

// Limites de ressources (correction P1-03) — refusées AVANT les opérations coûteuses lorsque
// c'est possible (taille dès la métadonnée du fichier, pages dès l'inspection, avant toute
// rasterisation complète) ; jamais un détail interne (chemin, trace, message de bibliothèque)
// dans le message, uniquement des grandeurs déjà connues de l'appelant.

export class FileTooLargeError extends DomainError {
  readonly code = "FILE_TOO_LARGE";
  constructor(input: { sizeBytes: number; maxBytes: number }) {
    super(`File size (${input.sizeBytes} bytes) exceeds the configured maximum (${input.maxBytes} bytes).`);
  }
}

export class PageLimitExceededError extends DomainError {
  readonly code = "PAGE_LIMIT_EXCEEDED";
  constructor(input: { pageCount: number; maxPages: number }) {
    super(`Document has ${input.pageCount} page(s), exceeding the configured maximum of ${input.maxPages}.`);
  }
}

export class CharacterLimitExceededError extends DomainError {
  readonly code = "CHARACTER_LIMIT_EXCEEDED";
  constructor(input: { characterCount: number; maxCharacters: number }) {
    super(
      `Extracted content has ${input.characterCount} character(s), exceeding the configured maximum of ` +
        `${input.maxCharacters}.`,
    );
  }
}

export class SpreadsheetLimitExceededError extends DomainError {
  readonly code = "SPREADSHEET_LIMIT_EXCEEDED";
  constructor(input: { reason: string }) {
    super(`Spreadsheet exceeds a configured limit: ${input.reason}.`);
  }
}

export class ImageDimensionLimitExceededError extends DomainError {
  readonly code = "IMAGE_DIMENSION_LIMIT_EXCEEDED";
  constructor(input: { widthPx: number; heightPx: number; maxDimensionPx: number }) {
    super(
      `Image dimensions (${input.widthPx}x${input.heightPx}px) exceed the configured maximum of ` +
        `${input.maxDimensionPx}px.`,
    );
  }
}

/** Correction P1-04 — le corpus d'analyse (chunks) n'est exposé que pour une extraction
 *  SUCCEEDED/PARTIALLY_SUCCEEDED (voir GetDocumentAnalysisInputUseCase) : jamais pour un document
 *  encore PENDING/READY/PROCESSING, ni pour un échec (FAILED/NOT_PROCESSABLE). */
export class ExtractionNotReadyForAnalysisError extends DomainError {
  readonly code = "EXTRACTION_NOT_READY_FOR_ANALYSIS";
  constructor(input: { status: string }) {
    super(`Extraction is in status "${input.status}" and is not ready to be analyzed.`);
  }
}
