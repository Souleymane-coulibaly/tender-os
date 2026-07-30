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
