import { DomainError } from "../../../shared-kernel/domain-error";

export class TechnicalMemoNotFoundError extends DomainError {
  readonly code = "TECHNICAL_MEMO_NOT_FOUND";
  constructor() {
    super("Technical memo not found.");
  }
}

export class DuplicateTechnicalMemoError extends DomainError {
  readonly code = "DUPLICATE_TECHNICAL_MEMO";
  constructor() {
    super("A technical memo already exists for this tender/lot.");
  }
}

export class TechnicalMemoSectionNotFoundError extends DomainError {
  readonly code = "TECHNICAL_MEMO_SECTION_NOT_FOUND";
  constructor() {
    super("Technical memo section not found.");
  }
}

export class TechnicalMemoSectionRequirementNotFoundError extends DomainError {
  readonly code = "TECHNICAL_MEMO_SECTION_REQUIREMENT_NOT_FOUND";
  constructor() {
    super("Technical memo section requirement link not found.");
  }
}

/** Mission §13 — la structure du modèle prévaut : un DOCX sans aucun titre détectable (via
 *  `w:outlineLvl`/style `HeadingN`) ne peut pas être analysé automatiquement. Jamais un plan
 *  inventé pour compenser. */
export class NoHeadingsDetectedError extends DomainError {
  readonly code = "NO_HEADINGS_DETECTED";
  constructor() {
    super("No headings could be detected in this document — TenderOS cannot infer a structure automatically.");
  }
}

/** Mission §38 — génération ≠ validation, jamais une génération lancée sur une section déjà
 *  verrouillée par une validation humaine sans régénération explicite. */
export class TechnicalMemoSectionAlreadyValidatedError extends DomainError {
  readonly code = "TECHNICAL_MEMO_SECTION_ALREADY_VALIDATED";
  constructor() {
    super("This section is already validated — explicitly regenerate it if you want to replace its content.");
  }
}

export class TechnicalMemoTemplateNotReadyError extends DomainError {
  readonly code = "TECHNICAL_MEMO_TEMPLATE_NOT_READY";
  constructor() {
    super("This technical memo's document template is not ready yet — the structure must be analyzed and confirmed before exporting.");
  }
}

/** Mission §35 "jamais une citation forgée par le LLM acceptée telle quelle" — même motif que
 *  `ChatCitationValidationFailedError` (Sprint 9). Une citation non retrouvée dans le contexte
 *  réellement fourni, ou un extrait non retrouvé mot pour mot, invalide toute la génération : jamais
 *  une persistance partielle. */
export class TechnicalMemoCitationValidationFailedError extends DomainError {
  readonly code = "TECHNICAL_MEMO_CITATION_VALIDATION_FAILED";
  constructor(input: { reason: string }) {
    super(`Technical memo section citation validation failed: ${input.reason}`);
  }
}
