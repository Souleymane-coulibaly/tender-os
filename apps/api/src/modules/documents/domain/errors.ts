import { DomainError } from "../../../shared-kernel/domain-error";

export class DocumentNotFoundError extends DomainError {
  readonly code = "DOCUMENT_NOT_FOUND";
  constructor() {
    super("Document not found.");
  }
}

export class DocumentVersionNotFoundError extends DomainError {
  readonly code = "DOCUMENT_VERSION_NOT_FOUND";
  constructor() {
    super("Document version not found.");
  }
}

export class DocumentArchivedError extends DomainError {
  readonly code = "DOCUMENT_ARCHIVED";
  constructor() {
    super("Archived documents cannot be modified or versioned.");
  }
}

export class DocumentDeletedError extends DomainError {
  readonly code = "DOCUMENT_DELETED";
  constructor() {
    super("This document has been deleted.");
  }
}

export class DocumentNotArchivedError extends DomainError {
  readonly code = "DOCUMENT_NOT_ARCHIVED";
  constructor() {
    super("Only an archived document can be restored.");
  }
}

export class DocumentPermissionMissingError extends DomainError {
  readonly code = "DOCUMENT_PERMISSION_MISSING";
  constructor(input: { permission: string }) {
    super(`Missing permission: ${input.permission}.`);
  }
}

export class InvalidDocumentOriginError extends DomainError {
  readonly code = "INVALID_DOCUMENT_ORIGIN";
  constructor(value: string) {
    super(`"${value}" is not a valid document origin.`);
  }
}

export class InvalidDocumentDomainError extends DomainError {
  readonly code = "INVALID_DOCUMENT_DOMAIN";
  constructor(value: string) {
    super(`"${value}" is not a valid document domain.`);
  }
}

export class ConcurrentVersionCreationError extends DomainError {
  readonly code = "CONCURRENT_VERSION_CREATION";
  constructor() {
    super("This document received a concurrent version upload. Retry.");
  }
}

export class DuplicateDocumentTenderAssociationError extends DomainError {
  readonly code = "DUPLICATE_DOCUMENT_TENDER_ASSOCIATION";
  constructor() {
    super("This document is already associated with this tender.");
  }
}

export class DocumentTenderAssociationNotFoundError extends DomainError {
  readonly code = "DOCUMENT_TENDER_ASSOCIATION_NOT_FOUND";
  constructor() {
    super("This document is not associated with this tender.");
  }
}

export class EmptyFileError extends DomainError {
  readonly code = "EMPTY_FILE";
  constructor() {
    super("The uploaded file is empty.");
  }
}

export class FileTooLargeError extends DomainError {
  readonly code = "FILE_TOO_LARGE";
  constructor(input: { maxSizeBytes: number }) {
    super(`The uploaded file exceeds the maximum allowed size of ${input.maxSizeBytes} bytes.`);
  }
}

export class UnsupportedFileTypeError extends DomainError {
  readonly code = "UNSUPPORTED_FILE_TYPE";
  constructor(input: { mimeType: string; extension: string }) {
    super(`Unsupported file type: "${input.mimeType}" (${input.extension}).`);
  }
}

export class InvalidFilenameError extends DomainError {
  readonly code = "INVALID_FILENAME";
  constructor() {
    super("The uploaded filename is invalid.");
  }
}
