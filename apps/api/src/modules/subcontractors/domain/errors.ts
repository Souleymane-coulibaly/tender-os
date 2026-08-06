import { DomainError } from "../../../shared-kernel/domain-error";

export class SubcontractorProfileNotFoundError extends DomainError {
  readonly code = "SUBCONTRACTOR_PROFILE_NOT_FOUND";
  constructor() {
    super("Ce sous-traitant est introuvable.");
  }
}

export class SubcontractorReferenceNotFoundError extends DomainError {
  readonly code = "SUBCONTRACTOR_REFERENCE_NOT_FOUND";
  constructor() {
    super("Cette référence de sous-traitant est introuvable.");
  }
}

export class SubcontractorCertificationNotFoundError extends DomainError {
  readonly code = "SUBCONTRACTOR_CERTIFICATION_NOT_FOUND";
  constructor() {
    super("Cette certification de sous-traitant est introuvable.");
  }
}

export class SubcontractorInsuranceNotFoundError extends DomainError {
  readonly code = "SUBCONTRACTOR_INSURANCE_NOT_FOUND";
  constructor() {
    super("Cette assurance de sous-traitant est introuvable.");
  }
}

export class InvalidSubcontractorProfileStatusTransitionError extends DomainError {
  readonly code = "INVALID_SUBCONTRACTOR_PROFILE_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Transition de statut invalide pour ce sous-traitant : ${input.from} → ${input.to}.`);
  }
}

export class InvalidSubcontractorIdentifierFormatError extends DomainError {
  readonly code = "INVALID_SUBCONTRACTOR_IDENTIFIER_FORMAT";
  constructor(field: string) {
    super(`Le format de "${field}" est invalide.`);
  }
}

export class SubcontractorPermissionMissingError extends DomainError {
  readonly code = "SUBCONTRACTOR_PERMISSION_MISSING";
  constructor() {
    super("Vous n'avez pas la permission nécessaire pour effectuer cette action sur le répertoire des sous-traitants.");
  }
}

export class DocumentNotUsableForSubcontractorProfileError extends DomainError {
  readonly code = "DOCUMENT_NOT_USABLE_FOR_SUBCONTRACTOR_PROFILE";
  constructor() {
    super("Ce document n'a pas encore de version exploitable et ne peut pas être rattaché.");
  }
}

export class DuplicateSubcontractorProfileDocumentError extends DomainError {
  readonly code = "DUPLICATE_SUBCONTRACTOR_PROFILE_DOCUMENT";
  constructor() {
    super("Ce document est déjà rattaché à ce sous-traitant.");
  }
}
