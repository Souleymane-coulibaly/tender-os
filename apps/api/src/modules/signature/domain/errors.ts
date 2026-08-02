import { DomainError } from "../../../shared-kernel/domain-error";

export class SignatureRequirementNotFoundError extends DomainError {
  readonly code = "SIGNATURE_REQUIREMENT_NOT_FOUND";
  constructor() {
    super("Signature requirement not found.");
  }
}

export class SignatoryNotFoundError extends DomainError {
  readonly code = "SIGNATORY_NOT_FOUND";
  constructor() {
    super("Signatory not found.");
  }
}

export class SignatoryNotVerifiedError extends DomainError {
  readonly code = "SIGNATORY_NOT_VERIFIED";
  constructor() {
    super("This signatory's authority has not been verified — a signature transaction cannot start.");
  }
}

export class SignatureTransactionNotFoundError extends DomainError {
  readonly code = "SIGNATURE_TRANSACTION_NOT_FOUND";
  constructor() {
    super("Signature transaction not found.");
  }
}

export class InvalidSignatureTransactionTransitionError extends DomainError {
  readonly code = "INVALID_SIGNATURE_TRANSACTION_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition signature transaction from ${input.from} to ${input.to}.`);
  }
}

export class ExportNotEligibleForSignatureError extends DomainError {
  readonly code = "EXPORT_NOT_ELIGIBLE_FOR_SIGNATURE";
  constructor(reason: string) {
    super(`This export cannot be sent for signature: ${reason}`);
  }
}

export class UnknownProviderTransactionError extends DomainError {
  readonly code = "UNKNOWN_PROVIDER_TRANSACTION";
  constructor() {
    super("This provider event references a transaction unknown to TenderOS — rejected.");
  }
}

export class WebhookSignatureInvalidError extends DomainError {
  readonly code = "WEBHOOK_SIGNATURE_INVALID";
  constructor() {
    super("The webhook's cryptographic signature could not be verified — rejected.");
  }
}

export class DuplicateProviderEventError extends DomainError {
  readonly code = "DUPLICATE_PROVIDER_EVENT";
  constructor() {
    super("This provider event has already been processed — ignored (idempotence).");
  }
}

export class SignatureProviderMisconfiguredError extends DomainError {
  readonly code = "SIGNATURE_PROVIDER_MISCONFIGURED";
  constructor(reason: string) {
    super(`Signature provider misconfigured: ${reason}`);
  }
}

export class UniversignProductionCallForbiddenError extends DomainError {
  readonly code = "UNIVERSIGN_PRODUCTION_CALL_FORBIDDEN";
  constructor() {
    super("Sprint 8A/8A bis must never call the Universign Production environment.");
  }
}

export class SignatureArtifactNotFoundError extends DomainError {
  readonly code = "SIGNATURE_ARTIFACT_NOT_FOUND";
  constructor() {
    super("Signature artifact not found.");
  }
}
