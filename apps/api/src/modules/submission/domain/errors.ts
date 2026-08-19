import { DomainError } from "../../../shared-kernel/domain-error";
import type { SubmissionReadinessReason } from "./submission-readiness-reason";

export class TenderSubmissionNotFoundError extends DomainError {
  readonly code = "TENDER_SUBMISSION_NOT_FOUND";
  constructor() {
    super("Submission not found.");
  }
}

export class SubmissionProofNotFoundError extends DomainError {
  readonly code = "SUBMISSION_PROOF_NOT_FOUND";
  constructor() {
    super("Submission proof not found.");
  }
}

/** Checkpoint 2.1-P2.1-FIX-F.1 — le dossier n'est pas prêt (au moins une raison BLOCKING parmi
 *  les 7 dimensions FIX-A..E, réévaluées à l'instant T de l'action, jamais un snapshot frontend).
 *  `reasons` porte les raisons structurées (code/sévérité/source/message/action) pour un contrat
 *  d'erreur exploitable (mission §27) — jamais un second contrat HTTP élargi au-delà de ça. */
export class TenderNotReadyForSubmissionError extends DomainError {
  readonly code = "TENDER_NOT_READY_FOR_SUBMISSION";
  constructor(readonly reasons: readonly SubmissionReadinessReason[]) {
    super(`Le dossier n'est pas prêt pour le dépôt : ${reasons.map((r) => r.message).join(" ")}`);
  }
}

export class SubmissionPackageMissingError extends DomainError {
  readonly code = "SUBMISSION_PACKAGE_MISSING";
  constructor() {
    super("Le package final est introuvable.");
  }
}

/** Mission §29 — le package référencé n'est plus la dernière version COMPLETED du Tender. */
export class SubmissionPackageOutdatedError extends DomainError {
  readonly code = "SUBMISSION_PACKAGE_OUTDATED";
  constructor() {
    super("Ce package n'est plus à jour. Générez une nouvelle version avant d'enregistrer le dépôt.");
  }
}

/** Mission §11 — la version de package fournie ne correspond pas à celle réellement chargée. */
export class SubmissionPackageVersionMismatchError extends DomainError {
  readonly code = "SUBMISSION_PACKAGE_VERSION_MISMATCH";
  constructor() {
    super("Cette version du package ne correspond pas au dossier.");
  }
}

export class SubmissionDeadlinePassedError extends DomainError {
  readonly code = "SUBMISSION_DEADLINE_PASSED";
  constructor() {
    super("La date limite de dépôt est dépassée.");
  }
}

/** Mission §30 — jamais révéler qu'une ressource existe chez un autre tenant : ce code reste
 *  générique côté message, la distinction se fait uniquement dans le contexte serveur (log). */
export class SubmissionProofCrossOrganizationError extends DomainError {
  readonly code = "SUBMISSION_PROOF_CROSS_ORGANIZATION";
  constructor() {
    super("La preuve de dépôt appartient à une autre organisation.");
  }
}

export class TenderSubmissionAlreadyReplacedError extends DomainError {
  readonly code = "TENDER_SUBMISSION_ALREADY_REPLACED";
  constructor() {
    super("Cette soumission a déjà été remplacée.");
  }
}

export class InvalidTenderSubmissionStatusTransitionError extends DomainError {
  readonly code = "INVALID_TENDER_SUBMISSION_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cette transition de statut n'est pas autorisée (${input.from} → ${input.to}).`);
  }
}

export class TenderSubmissionPermissionMissingError extends DomainError {
  readonly code = "TENDER_SUBMISSION_PERMISSION_MISSING";
  constructor() {
    super("Vous n'avez pas l'autorisation d'enregistrer ce dépôt.");
  }
}

/** Mission §32 — une soumission "en vol" existe déjà pour ce Tender (contrainte d'unicité DB). */
export class ActiveTenderSubmissionAlreadyExistsError extends DomainError {
  readonly code = "ACTIVE_TENDER_SUBMISSION_ALREADY_EXISTS";
  constructor() {
    super("Une soumission est déjà en cours pour ce marché — remplacez-la explicitement avant d'en enregistrer une nouvelle.");
  }
}

/** Mission §13 — la confirmation d'un reçu exige une référence de reçu ou une preuve valide. */
export class ReceiptConfirmationRequiresEvidenceError extends DomainError {
  readonly code = "RECEIPT_CONFIRMATION_REQUIRES_EVIDENCE";
  constructor() {
    super("La confirmation du reçu exige une référence de reçu ou une preuve de dépôt déjà ajoutée.");
  }
}

export class CustomPlatformNameRequiredError extends DomainError {
  readonly code = "CUSTOM_PLATFORM_NAME_REQUIRED";
  constructor() {
    super("Un nom de plateforme est requis pour ce choix.");
  }
}

export class DocumentNotUsableForSubmissionProofError extends DomainError {
  readonly code = "DOCUMENT_NOT_USABLE_FOR_SUBMISSION_PROOF";
  constructor(reason: string) {
    super(`Ce document ne peut pas être utilisé comme preuve de dépôt : ${reason}`);
  }
}
