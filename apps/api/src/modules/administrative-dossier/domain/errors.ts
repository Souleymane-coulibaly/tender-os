import { DomainError } from "../../../shared-kernel/domain-error";

export class AdministrativeDossierNotFoundError extends DomainError {
  readonly code = "ADMINISTRATIVE_DOSSIER_NOT_FOUND";
  constructor() {
    super("Administrative dossier not found.");
  }
}

export class AdministrativeRequirementNotFoundError extends DomainError {
  readonly code = "ADMINISTRATIVE_REQUIREMENT_NOT_FOUND";
  constructor() {
    super("Administrative requirement not found.");
  }
}

export class InvalidAdministrativeRequirementValidationStatusTransitionError extends DomainError {
  readonly code = "INVALID_ADMINISTRATIVE_REQUIREMENT_VALIDATION_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition administrative requirement validation status from ${input.from} to ${input.to}.`);
  }
}

export class AdministrativeDocumentNotFoundError extends DomainError {
  readonly code = "ADMINISTRATIVE_DOCUMENT_NOT_FOUND";
  constructor() {
    super("Administrative document not found.");
  }
}

export class AdministrativeDocumentRevisionNotFoundError extends DomainError {
  readonly code = "ADMINISTRATIVE_DOCUMENT_REVISION_NOT_FOUND";
  constructor() {
    super("Administrative document revision not found.");
  }
}

/** Mission §21 — "une ancienne révision ne doit jamais être écrasée" : une révision qui n'est plus
 *  DRAFT est figée, toute tentative de la modifier directement est refusée. */
export class ImmutableAdministrativeDocumentRevisionError extends DomainError {
  readonly code = "IMMUTABLE_ADMINISTRATIVE_DOCUMENT_REVISION";
  constructor() {
    super("Only a DRAFT revision can be edited — create a new revision instead of mutating a non-draft one.");
  }
}

export class InvalidAdministrativeDocumentRevisionStatusTransitionError extends DomainError {
  readonly code = "INVALID_ADMINISTRATIVE_DOCUMENT_REVISION_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition administrative document revision from ${input.from} to ${input.to}.`);
  }
}

/** Mission §21 — une validation exige une révision avec un fichier réellement attaché, jamais un
 *  brouillon vide. */
export class AdministrativeDocumentNotReadyForValidationError extends DomainError {
  readonly code = "ADMINISTRATIVE_DOCUMENT_NOT_READY_FOR_VALIDATION";
  constructor(reason: string) {
    super(`This administrative document cannot be validated yet: ${reason}`);
  }
}

/** Mission §21 — reproductibilité : une validation référence une révision EXACTE ; re-valider
 *  exactement la même révision est un no-op toléré (idempotence), en valider une AUTRE alors qu'une
 *  révision différente est déjà validée est refusé tant que la validation en cours n'est pas
 *  explicitement révoquée par une nouvelle révision (mission "jamais un remplacement silencieux"). */
export class AdministrativeDocumentAlreadyValidatedWithDifferentRevisionError extends DomainError {
  readonly code = "ADMINISTRATIVE_DOCUMENT_ALREADY_VALIDATED_WITH_DIFFERENT_REVISION";
  constructor() {
    super("This administrative document already has a different revision validated — reject or supersede it before validating another one.");
  }
}

export class DuplicateAdministrativeDossierError extends DomainError {
  readonly code = "DUPLICATE_ADMINISTRATIVE_DOSSIER";
  constructor() {
    super("An administrative dossier already exists for this tender.");
  }
}

/** Correctif audit Codex P1-003 (même motif que `DocumentNotUsableForDeliverableError`) — un
 *  `documentId` attaché à une pièce administrative doit référencer un document réellement
 *  exploitable (existe, non supprimé, au moins une version) — jamais une simple chaîne non
 *  vérifiée. */
export class DocumentNotUsableForAdministrativeDocumentError extends DomainError {
  readonly code = "DOCUMENT_NOT_USABLE_FOR_ADMINISTRATIVE_DOCUMENT";
  constructor(reason: string) {
    super(`This document cannot be attached: ${reason}`);
  }
}

export class AdministrativeDossierPermissionMissingError extends DomainError {
  readonly code = "ADMINISTRATIVE_DOSSIER_PERMISSION_MISSING";
  constructor() {
    super("Actor lacks the required administrative dossier permission for this action.");
  }
}

// --- Sprint 8C Phase 2 ---

export class InvalidAdministrativeSignatureStatusTransitionError extends DomainError {
  readonly code = "INVALID_ADMINISTRATIVE_SIGNATURE_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition administrative signature status from ${input.from} to ${input.to}.`);
  }
}

export class AdministrativeSignatureNotRequiredError extends DomainError {
  readonly code = "ADMINISTRATIVE_SIGNATURE_NOT_REQUIRED";
  constructor() {
    super("This administrative document does not require a signature.");
  }
}

export class AdministrativeSignatureModeMismatchError extends DomainError {
  readonly code = "ADMINISTRATIVE_SIGNATURE_MODE_MISMATCH";
  constructor(reason: string) {
    super(`This action does not match the configured signature mode: ${reason}`);
  }
}

export class ConsortiumNotFoundError extends DomainError {
  readonly code = "CONSORTIUM_NOT_FOUND";
  constructor() {
    super("Consortium not found.");
  }
}

export class DuplicateConsortiumError extends DomainError {
  readonly code = "DUPLICATE_CONSORTIUM";
  constructor() {
    super("A consortium already exists for this tender.");
  }
}

/** Mission §15 — "le mandataire appartient au groupement" : jamais un membre absent de la liste
 *  déclarée. */
export class ConsortiumMandataireNotAMemberError extends DomainError {
  readonly code = "CONSORTIUM_MANDATAIRE_NOT_A_MEMBER";
  constructor() {
    super("The mandataire must be one of the consortium's declared members.");
  }
}

export class ConsortiumMemberPercentagesExceed100Error extends DomainError {
  readonly code = "CONSORTIUM_MEMBER_PERCENTAGES_EXCEED_100";
  constructor() {
    super("The sum of consortium member percentages cannot exceed 100.");
  }
}

export class Dc1DeclarationNotFoundError extends DomainError {
  readonly code = "DC1_DECLARATION_NOT_FOUND";
  constructor() {
    super("DC1 declaration not found.");
  }
}

export class DuplicateDc1DeclarationError extends DomainError {
  readonly code = "DUPLICATE_DC1_DECLARATION";
  constructor() {
    super("A DC1 declaration already exists for this tender.");
  }
}

export class Dc2DeclarationNotFoundError extends DomainError {
  readonly code = "DC2_DECLARATION_NOT_FOUND";
  constructor() {
    super("DC2 declaration not found.");
  }
}

export class DuplicateDc2DeclarationError extends DomainError {
  readonly code = "DUPLICATE_DC2_DECLARATION";
  constructor() {
    super("A DC2 declaration already exists for this tender.");
  }
}

export class DumeDeclarationNotFoundError extends DomainError {
  readonly code = "DUME_DECLARATION_NOT_FOUND";
  constructor() {
    super("DUME declaration not found.");
  }
}

export class DuplicateDumeDeclarationError extends DomainError {
  readonly code = "DUPLICATE_DUME_DECLARATION";
  constructor() {
    super("A DUME declaration already exists for this tender.");
  }
}

export class SubcontractorDeclarationNotFoundError extends DomainError {
  readonly code = "SUBCONTRACTOR_DECLARATION_NOT_FOUND";
  constructor() {
    super("Subcontractor declaration (DC4) not found.");
  }
}

export class InvalidSubcontractorAmountError extends DomainError {
  readonly code = "INVALID_SUBCONTRACTOR_AMOUNT";
  constructor(reason: string) {
    super(`Invalid subcontractor amount: ${reason}`);
  }
}

/** Mission §12 — "cohérence montant/pourcentage" avec le pricing gelé de l'Acte d'engagement. */
export class SubcontractorAmountInconsistentWithPricingError extends DomainError {
  readonly code = "SUBCONTRACTOR_AMOUNT_INCONSISTENT_WITH_PRICING";
  constructor() {
    super("The subcontractor amount/percentage is inconsistent with the engagement act's frozen pricing.");
  }
}

export class EngagementActNotFoundError extends DomainError {
  readonly code = "ENGAGEMENT_ACT_NOT_FOUND";
  constructor() {
    super("Engagement act not found.");
  }
}

export class DuplicateEngagementActError extends DomainError {
  readonly code = "DUPLICATE_ENGAGEMENT_ACT";
  constructor() {
    super("An engagement act already exists for this tender.");
  }
}

/** Mission §14 — jamais un remplacement silencieux d'un montant déjà gelé ; re-sélectionner
 *  exactement la même paire (estimateId, version) reste un no-op toléré. */
export class EngagementActPricingAlreadyFrozenError extends DomainError {
  readonly code = "ENGAGEMENT_ACT_PRICING_ALREADY_FROZEN";
  constructor() {
    super("This engagement act already references a frozen pricing estimate version — explicitly unfreeze before selecting a different one.");
  }
}

export class PricingEstimateNotForThisTenderError extends DomainError {
  readonly code = "PRICING_ESTIMATE_NOT_FOR_THIS_TENDER";
  constructor() {
    super("This pricing estimate does not belong to this tender.");
  }
}

export class SigningPowerNotFoundError extends DomainError {
  readonly code = "SIGNING_POWER_NOT_FOUND";
  constructor() {
    super("Signing power not found.");
  }
}

// --- Sprint 8C Phase 3 (génération PDF/XML) ---

/** Mission §14 — jamais un montant implicite dans un document juridique généré : l'Acte
 *  d'engagement doit avoir un montant explicitement gelé avant de pouvoir être généré en PDF. */
export class EngagementActPricingNotFrozenError extends DomainError {
  readonly code = "ENGAGEMENT_ACT_PRICING_NOT_FROZEN";
  constructor() {
    super("This engagement act has no frozen pricing amount yet — freeze a pricing estimate version before generating the document.");
  }
}

export class Dc2DeclarationHasNoVersionError extends DomainError {
  readonly code = "DC2_DECLARATION_HAS_NO_VERSION";
  constructor() {
    super("This DC2 declaration has no version yet — create a version before generating the document.");
  }
}

export class DumeDeclarationHasNoVersionError extends DomainError {
  readonly code = "DUME_DECLARATION_HAS_NO_VERSION";
  constructor() {
    super("This DUME declaration has no version yet — create a version before generating the document.");
  }
}

// --- Sprint 8C.1 (formulaires officiels remplissables) ---

export class OfficialAdministrativeTemplateNotFoundError extends DomainError {
  readonly code = "OFFICIAL_ADMINISTRATIVE_TEMPLATE_NOT_FOUND";
  constructor() {
    super("No active official template found for this form type.");
  }
}

export class AdministrativeFormDraftNotFoundError extends DomainError {
  readonly code = "ADMINISTRATIVE_FORM_DRAFT_NOT_FOUND";
  constructor() {
    super("Administrative form draft not found.");
  }
}

export class BuyerProvidedFormTemplateNotFoundError extends DomainError {
  readonly code = "BUYER_PROVIDED_FORM_TEMPLATE_NOT_FOUND";
  constructor() {
    super("Buyer-provided form template not found.");
  }
}

/** Mission — un formulaire officiel (DC1/DC2/DC4/ATTRI1) attend un type de pièce du catalogue
 *  fermé, jamais une valeur libre. */
export class UnsupportedAdministrativeFormTypeError extends DomainError {
  readonly code = "UNSUPPORTED_ADMINISTRATIVE_FORM_TYPE";
  constructor() {
    super("The requested form type is not one of the supported official forms (DC1, DC2, DC4, ACTE_ENGAGEMENT).");
  }
}

/** Mission §19/§25 — la génération de l'Annexe TenderOS est bloquée tant qu'un champ obligatoire
 *  manque ou qu'aucun gabarit de référence (acheteur ou officiel) n'est résolu — jamais une
 *  génération silencieuse avec des champs invités/absents. */
export class AdministrativeFormNotReadyForGenerationError extends DomainError {
  readonly code = "ADMINISTRATIVE_FORM_NOT_READY_FOR_GENERATION";
  constructor(readonly blockingCodes: readonly string[]) {
    super(`Cannot generate: blocking issues remain (${blockingCodes.join(", ")}).`);
  }
}
