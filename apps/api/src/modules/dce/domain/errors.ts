import { DomainError } from "../../../shared-kernel/domain-error";

export class DceNotFoundError extends DomainError {
  readonly code = "DCE_NOT_FOUND";
  constructor() {
    super("DCE not found.");
  }
}

/** Un Tender ne porte jamais plus d'un DCE (conception §4) — tenderId unique. */
export class DceAlreadyExistsError extends DomainError {
  readonly code = "DCE_ALREADY_EXISTS";
  constructor() {
    super("This tender already has a DCE. Use GET to retrieve it.");
  }
}

export class DceDocumentNotFoundError extends DomainError {
  readonly code = "DCE_DOCUMENT_NOT_FOUND";
  constructor() {
    super("This document does not belong to this DCE.");
  }
}

export class InvalidDceStatusError extends DomainError {
  readonly code = "INVALID_DCE_STATUS";
  constructor(value: string) {
    super(`"${value}" is not a valid DCE status.`);
  }
}

export class DcePermissionMissingError extends DomainError {
  readonly code = "DCE_PERMISSION_MISSING";
  constructor(input: { permission: string }) {
    super(`Missing permission: ${input.permission}.`);
  }
}

/**
 * Rejet de l'archive entière (AUDIT ZIP) — toute anomalie structurelle ou indice d'attaque
 * (traversal, chemin absolu, lien symbolique, archive imbriquée, nombre d'entrées, taille totale,
 * ratio de compression) rejette l'import complet plutôt que d'extraire partiellement une archive
 * suspecte. Les rejets liés au format d'un fichier précis (non structurels) ne lèvent jamais
 * cette erreur : ils sont reportés individuellement dans le résultat de l'import (conception §5).
 */
export class ZipSecurityViolationError extends DomainError {
  readonly code = "ZIP_SECURITY_VIOLATION";
  constructor(input: { reason: string }) {
    super(`ZIP archive rejected: ${input.reason}.`);
  }
}

export class TooManyFilesError extends DomainError {
  readonly code = "TOO_MANY_FILES";
  constructor(input: { maxFiles: number }) {
    super(`Too many files in a single import (maximum ${input.maxFiles}).`);
  }
}

export class TenderArchivedForDceMutationError extends DomainError {
  readonly code = "TENDER_ARCHIVED_FOR_DCE_MUTATION";
  constructor() {
    super("This tender is archived: its DCE can no longer be modified.");
  }
}

export class EmptyFileError extends DomainError {
  readonly code = "DCE_EMPTY_FILE";
  constructor() {
    super("The file is empty.");
  }
}

export class FileTooLargeError extends DomainError {
  readonly code = "DCE_FILE_TOO_LARGE";
  constructor(input: { maxSizeBytes: number }) {
    super(`File exceeds the maximum allowed size (${input.maxSizeBytes} bytes).`);
  }
}

export class UnsupportedFileTypeError extends DomainError {
  readonly code = "DCE_UNSUPPORTED_FILE_TYPE";
  constructor(input: { filename: string }) {
    super(`Unsupported file type: ${input.filename}.`);
  }
}

export class InvalidFilenameError extends DomainError {
  readonly code = "DCE_INVALID_FILENAME";
  constructor(input: { filename: string }) {
    super(`Invalid or dangerous filename: ${input.filename}.`);
  }
}

export class DceImportJobNotFoundError extends DomainError {
  readonly code = "DCE_IMPORT_JOB_NOT_FOUND";
  constructor() {
    super("Import job not found.");
  }
}

export class InvalidDceImportJobStatusTransitionError extends DomainError {
  readonly code = "INVALID_DCE_IMPORT_JOB_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition import job from ${input.from} to ${input.to}.`);
  }
}
