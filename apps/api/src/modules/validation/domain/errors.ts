import { DomainError } from "../../../shared-kernel/domain-error";

export class ValidationRunNotFoundError extends DomainError {
  readonly code = "VALIDATION_RUN_NOT_FOUND";
  constructor() {
    super("Validation run not found.");
  }
}

export class ValidationIssueNotFoundError extends DomainError {
  readonly code = "VALIDATION_ISSUE_NOT_FOUND";
  constructor() {
    super("Validation issue not found.");
  }
}

export class InvalidResolutionTransitionError extends DomainError {
  readonly code = "INVALID_RESOLUTION_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition validation issue resolution from ${input.from} to ${input.to}.`);
  }
}

export class BlockingIssuesOpenError extends DomainError {
  readonly code = "BLOCKING_ISSUES_OPEN";
  constructor(count: number) {
    super(`Cannot approve: ${count} blocking issue(s) remain open.`);
  }
}

export class FinalApprovalNotFoundError extends DomainError {
  readonly code = "FINAL_APPROVAL_NOT_FOUND";
  constructor() {
    super("Final approval not found.");
  }
}

export class ApprovalAlreadyInvalidatedError extends DomainError {
  readonly code = "APPROVAL_ALREADY_INVALIDATED";
  constructor() {
    super("This approval has already been invalidated by a later modification.");
  }
}

export class ManifestMismatchError extends DomainError {
  readonly code = "MANIFEST_MISMATCH";
  constructor() {
    super("The export to be generated as FINAL no longer matches the manifest that was approved — a new validation and approval are required.");
  }
}
