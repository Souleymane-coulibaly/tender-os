import { DomainError } from "../../../shared-kernel/domain-error";

export class InvalidKnowledgeCategoryError extends DomainError {
  readonly code = "INVALID_KNOWLEDGE_CATEGORY";
  constructor(value: string) {
    super(`"${value}" is not a valid knowledge category.`);
  }
}

export class InvalidKnowledgeEntryStatusError extends DomainError {
  readonly code = "INVALID_KNOWLEDGE_ENTRY_STATUS";
  constructor(value: string) {
    super(`"${value}" is not a valid knowledge entry status.`);
  }
}

export class InvalidKnowledgeEntryStatusTransitionError extends DomainError {
  readonly code = "INVALID_KNOWLEDGE_ENTRY_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition knowledge entry from ${input.from} to ${input.to}.`);
  }
}

export class InvalidKnowledgeSourceTypeError extends DomainError {
  readonly code = "INVALID_KNOWLEDGE_SOURCE_TYPE";
  constructor(value: string) {
    super(`"${value}" is not a valid knowledge source type.`);
  }
}

export class KnowledgePermissionMissingError extends DomainError {
  readonly code = "KNOWLEDGE_PERMISSION_MISSING";
  constructor(input: { permission: string }) {
    super(`Missing permission: ${input.permission}.`);
  }
}

export class KnowledgeSpaceNotFoundError extends DomainError {
  readonly code = "KNOWLEDGE_SPACE_NOT_FOUND";
  constructor() {
    super("Knowledge space not found.");
  }
}

export class KnowledgeEntryNotFoundError extends DomainError {
  readonly code = "KNOWLEDGE_ENTRY_NOT_FOUND";
  constructor() {
    super("Knowledge entry not found.");
  }
}

/** Mission Sprint 5 §"Archivage" — une mutation de contenu (métadonnées, document, tag) est
 *  refusée sur une entrée archivée : il faut d'abord la restaurer explicitement. */
export class KnowledgeEntryArchivedError extends DomainError {
  readonly code = "KNOWLEDGE_ENTRY_ARCHIVED";
  constructor() {
    super("This knowledge entry is archived and cannot be mutated.");
  }
}

export class KnowledgeEntryNotArchivedError extends DomainError {
  readonly code = "KNOWLEDGE_ENTRY_NOT_ARCHIVED";
  constructor() {
    super("This knowledge entry is not archived.");
  }
}

export class KnowledgeEntryVersionNotFoundError extends DomainError {
  readonly code = "KNOWLEDGE_ENTRY_VERSION_NOT_FOUND";
  constructor() {
    super("Knowledge entry version not found.");
  }
}

export class KnowledgeDocumentNotFoundError extends DomainError {
  readonly code = "KNOWLEDGE_DOCUMENT_NOT_FOUND";
  constructor() {
    super("Knowledge document not found.");
  }
}

/** Mission §"Ne pas dupliquer... statuts de traitement" — un document ne peut être (re)traité que
 *  s'il n'est pas déjà en cours (même garde que `DocumentExtractionRepository.reserveForProcessing`,
 *  module Extraction). */
export class KnowledgeDocumentNotReprocessableError extends DomainError {
  readonly code = "KNOWLEDGE_DOCUMENT_NOT_REPROCESSABLE";
  constructor(input: { status: string }) {
    super(`Knowledge document in status "${input.status}" cannot be reprocessed right now.`);
  }
}

export class KnowledgeMetadataValidationFailedError extends DomainError {
  readonly code = "KNOWLEDGE_METADATA_VALIDATION_FAILED";
  constructor(input: { reason: string }) {
    super(`Knowledge entry metadata failed validation: ${input.reason}.`);
  }
}

/** Mission §"Tags" — normalisation/unicité tenant-aware : un tag déjà présent (même après
 *  normalisation de casse) sur cette organisation ne peut jamais être recréé sous un id distinct. */
export class DuplicateKnowledgeTagError extends DomainError {
  readonly code = "DUPLICATE_KNOWLEDGE_TAG";
  constructor(input: { label: string }) {
    super(`A tag normalizing to "${input.label}" already exists for this organization.`);
  }
}

export class KnowledgeTagNotFoundError extends DomainError {
  readonly code = "KNOWLEDGE_TAG_NOT_FOUND";
  constructor() {
    super("Knowledge tag not found.");
  }
}

/** V2 Sprint 8 §15/§16 — seule la version ACTIVE d'une entrée READY/PARTIALLY_READY peut être
 *  validée (mission "seuls les contenus VALIDATED... réutilisables") — jamais une entrée DRAFT/
 *  PROCESSING/FAILED/ARCHIVED, jamais une ancienne version (il faut la restaurer d'abord, ce qui la
 *  rend active). */
export class KnowledgeEntryNotReadyForValidationError extends DomainError {
  readonly code = "KNOWLEDGE_ENTRY_NOT_READY_FOR_VALIDATION";
  constructor(input: { status: string }) {
    super(`Knowledge entry in status "${input.status}" cannot be validated.`);
  }
}

/** V2 Sprint 8 — la version active est déjà validée ; re-valider ne serait qu'une horodate écrasée
 *  silencieusement, jamais autorisé (mission §16, généralisé : chaque décision de confiance doit
 *  être une action explicite et traçable, jamais implicite). */
export class KnowledgeEntryAlreadyValidatedError extends DomainError {
  readonly code = "KNOWLEDGE_ENTRY_ALREADY_VALIDATED";
  constructor() {
    super("The active version of this knowledge entry is already validated.");
  }
}

/** V2 Sprint 8 §19 — la promotion depuis un ChecklistItem exige une décision humaine déjà actée
 *  (`ChecklistComplianceStatus.VALIDATED`) : jamais une capitalisation depuis un contenu encore
 *  TO_REVIEW/NON_COMPLIANT/READY (non confirmé par un humain). */
export class KnowledgeEntryPromotionRequiresValidatedChecklistItemError extends DomainError {
  readonly code = "KNOWLEDGE_ENTRY_PROMOTION_REQUIRES_VALIDATED_CHECKLIST_ITEM";
  constructor(input: { status: string }) {
    super(`Checklist item in compliance status "${input.status}" cannot be promoted to a knowledge entry (must be VALIDATED).`);
  }
}

/** Mission §"Provenance" — un passage retourné par la recherche ou consulté sur une entrée doit
 *  toujours provenir d'un chunk réellement persisté pour ce document/cette organisation : jamais
 *  une citation reconstruite ou un chunk d'un autre document/organisation. Garde défensive contre
 *  un bug d'assemblage, jamais destinée au flux normal (voir `finding-provenance-validator.ts`,
 *  Sprint 4.2, pour le motif équivalent appliqué aux affirmations d'un modèle IA). */
export class KnowledgeProvenanceValidationFailedError extends DomainError {
  readonly code = "KNOWLEDGE_PROVENANCE_VALIDATION_FAILED";
  constructor(input: { reason: string }) {
    super(`Knowledge provenance failed validation: ${input.reason}.`);
  }
}
