import { DomainError } from "../../../shared-kernel/domain-error";

/** Mission Sprint 13 (décision utilisateur explicite) — "si une structure XLSX rencontrée n'est
 *  pas gérée de manière fiable, échouer proprement... plutôt que reconstruire silencieusement le
 *  fichier". Jamais une reconstruction du classeur en dernier recours : un refus explicite et
 *  traçable, ou rien. */
export class UnsupportedXlsxStructureError extends DomainError {
  readonly code = "UNSUPPORTED_XLSX_STRUCTURE";
  constructor(reason: string) {
    super(`Unsupported XLSX structure: ${reason}`);
  }
}

export class CorruptedXlsxFileError extends DomainError {
  readonly code = "CORRUPTED_XLSX_FILE";
  constructor(reason: string) {
    super(`Corrupted or unreadable XLSX file: ${reason}`);
  }
}

export class PricingScheduleNotFoundError extends DomainError {
  readonly code = "PRICING_SCHEDULE_NOT_FOUND";
  constructor() {
    super("Pricing schedule not found.");
  }
}

export class DuplicatePricingScheduleError extends DomainError {
  readonly code = "DUPLICATE_PRICING_SCHEDULE";
  constructor() {
    super("A pricing schedule already exists for this tender/lot/candidate/source document.");
  }
}

/** Mission §9 — anti-IDOR : `sourceDocumentId` doit référencer un document DÉJÀ listé dans le DCE
 *  de ce Tender, jamais un identifiant accepté tel quel. 404 anti-énumération (même convention que
 *  `PricingScheduleNotFoundError`), jamais une révélation de l'existence d'un document ailleurs. */
export class SourceDocumentNotInDceError extends DomainError {
  readonly code = "SOURCE_DOCUMENT_NOT_IN_DCE";
  constructor() {
    super("sourceDocumentId does not reference a document present in this tender's DCE.");
  }
}

export class PricingScheduleVersionValidatedError extends DomainError {
  readonly code = "PRICING_SCHEDULE_VERSION_VALIDATED";
  constructor() {
    super("This pricing schedule version is already validated and immutable — create a new version to change prices.");
  }
}

export class PricingScheduleLineNotFoundError extends DomainError {
  readonly code = "PRICING_SCHEDULE_LINE_NOT_FOUND";
  constructor() {
    super("Pricing schedule line not found.");
  }
}

export class PricingScheduleVersionNotFoundError extends DomainError {
  readonly code = "PRICING_SCHEDULE_VERSION_NOT_FOUND";
  constructor() {
    super("Pricing schedule version not found.");
  }
}

/** Mission §29 — les quantités/désignations imposées par l'acheteur sont verrouillées, jamais
 *  modifiables via l'API même par un utilisateur autorisé à saisir un prix. */
export class LockedBuyerFieldError extends DomainError {
  readonly code = "LOCKED_BUYER_FIELD";
  constructor(fieldName: string) {
    super(`Field "${fieldName}" is locked (buyer-provided data) and cannot be modified.`);
  }
}

export class PricingScheduleValidationBlockedError extends DomainError {
  readonly code = "PRICING_SCHEDULE_VALIDATION_BLOCKED";
  constructor(reason: string) {
    super(`Pricing schedule cannot be validated: ${reason}`);
  }
}

export class FinancialFileNotReadyError extends DomainError {
  readonly code = "FINANCIAL_FILE_NOT_READY";
  constructor() {
    super("The pricing schedule version must be validated before generating the final financial file.");
  }
}

/** Mission §18 — seul un PRICE_ITEM peut porter un prix ; un titre de section/sous-total/note ne
 *  doit jamais devenir un `PricingLine` tarifaire, même par une saisie manuelle. */
export class NonPriceableLineError extends DomainError {
  readonly code = "NON_PRICEABLE_LINE";
  constructor(kind: string) {
    super(`A line of kind "${kind}" cannot carry a price.`);
  }
}
