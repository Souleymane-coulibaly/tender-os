import { DomainError } from "../../../shared-kernel/domain-error";

export class SubmissionPackageNotFoundError extends DomainError {
  readonly code = "SUBMISSION_PACKAGE_NOT_FOUND";
  constructor() {
    super("Submission package not found.");
  }
}

export class PackageNotReadyError extends DomainError {
  readonly code = "PACKAGE_NOT_READY";
  constructor(reason: string) {
    super(`Cannot create the submission package: ${reason}`);
  }
}

export class DuplicateArchivePathError extends DomainError {
  readonly code = "DUPLICATE_ARCHIVE_PATH";
  constructor(path: string) {
    super(`Archive path collision: "${path}" is already used by another file in this package.`);
  }
}

export class UnsafeArchivePathError extends DomainError {
  readonly code = "UNSAFE_ARCHIVE_PATH";
  constructor(path: string) {
    super(`Refusing an unsafe archive path: "${path}"`);
  }
}

