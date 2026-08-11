import { DomainError } from "../../../shared-kernel/domain-error";

export class ResponsePackageNotFoundError extends DomainError {
  readonly code = "RESPONSE_PACKAGE_NOT_FOUND";
  constructor() {
    super("Response package not found.");
  }
}

export class DuplicateResponsePackageError extends DomainError {
  readonly code = "DUPLICATE_RESPONSE_PACKAGE";
  constructor() {
    super("A response package already exists for this tender/lot/candidate.");
  }
}

export class ResponsePackageVersionNotFoundError extends DomainError {
  readonly code = "RESPONSE_PACKAGE_VERSION_NOT_FOUND";
  constructor() {
    super("Response package version not found.");
  }
}

export class ResponsePackageVersionValidatedError extends DomainError {
  readonly code = "RESPONSE_PACKAGE_VERSION_VALIDATED";
  constructor() {
    super("This response package version is already validated and immutable — create a new version to change its content.");
  }
}

export class PackageItemNotFoundError extends DomainError {
  readonly code = "PACKAGE_ITEM_NOT_FOUND";
  constructor() {
    super("Package item not found.");
  }
}

/** Mission §26/§97 — le SEUL vrai blocage : au moins un item REQUIRED (ou CONDITIONAL devenu
 *  applicable) + APPLICABLE + MISSING. Jamais déclenché par un OPTIONAL absent, un NOT_APPLICABLE,
 *  ou un NEEDS_REVIEW. */
export class ResponsePackageValidationBlockedError extends DomainError {
  readonly code = "RESPONSE_PACKAGE_VALIDATION_BLOCKED";
  constructor(missingLabels: readonly string[]) {
    super(`Response package cannot be validated: ${missingLabels.length} required piece(s) missing: ${missingLabels.join(", ")}.`);
  }
}

export class PackageArtifactNotReadyError extends DomainError {
  readonly code = "PACKAGE_ARTIFACT_NOT_READY";
  constructor() {
    super("The response package version must be validated before generating the ZIP artifact.");
  }
}

/** Mission §59 — jamais un écrasement silencieux d'un fichier existant dans l'archive. */
export class DuplicateArchivePathError extends DomainError {
  readonly code = "DUPLICATE_ARCHIVE_PATH";
  constructor(path: string) {
    super(`Archive path "${path}" is already used by another item in this package.`);
  }
}

export class UnsafeArchivePathError extends DomainError {
  readonly code = "UNSAFE_ARCHIVE_PATH";
  constructor(path: string) {
    super(`Unsafe archive path rejected: "${path}".`);
  }
}
