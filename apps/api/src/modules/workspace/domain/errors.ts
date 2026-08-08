import { DomainError } from "../../../shared-kernel/domain-error";

/** Convention anti-énumération déjà établie dans ce dépôt (`TenderNotFoundError`,
 *  `DocumentNotFoundError`, `ClientAccountNotFoundError`...) : un Tender introuvable OU un acteur
 *  sans accès participant reçoivent la MÊME erreur — jamais une confirmation d'existence partielle. */
export class TenderParticipantAccessDeniedError extends DomainError {
  readonly code = "TENDER_PARTICIPANT_ACCESS_DENIED";
  constructor() {
    super("Vous n'avez pas accès à l'espace de travail collaboratif de ce Tender.");
  }
}

export class TenderParticipantNotFoundError extends DomainError {
  readonly code = "TENDER_PARTICIPANT_NOT_FOUND";
  constructor() {
    super("Ce participant est introuvable sur ce Tender.");
  }
}

/** Mission §7 — un utilisateur déjà participant actif ne peut pas être ajouté une seconde fois ;
 *  passer par le changement de rôle. */
export class TenderParticipantAlreadyActiveError extends DomainError {
  readonly code = "TENDER_PARTICIPANT_ALREADY_ACTIVE";
  constructor() {
    super("Cet utilisateur est déjà participant actif de ce Tender.");
  }
}

/** Mission §7 — l'utilisateur n'est ni membre actif de l'organisation, ni autorisé sur l'entreprise
 *  candidate du Tender (et aucun bypass administratif tracé n'a été emprunté). */
export class InvalidTenderParticipantCandidateError extends DomainError {
  readonly code = "INVALID_TENDER_PARTICIPANT_CANDIDATE";
  constructor() {
    super("Cet utilisateur ne peut pas être affecté à ce Tender (organisation ou accès client insuffisant).");
  }
}

/** Mission §42 — un bypass administratif (OWNER/ORGANIZATION_ADMIN sans affectation client réelle
 *  sur la cible) exige toujours une justification explicite, quelle que soit l'action. */
export class TenderParticipantBypassJustificationRequiredError extends DomainError {
  readonly code = "TENDER_PARTICIPANT_BYPASS_JUSTIFICATION_REQUIRED";
  constructor() {
    super("Une justification est requise pour affecter cet utilisateur sans affectation client réelle.");
  }
}

export class TaskNotFoundError extends DomainError {
  readonly code = "TASK_NOT_FOUND";
  constructor() {
    super("Cette tâche est introuvable.");
  }
}

/** Mission §17 — un UUID utilisateur valide ne suffit pas : l'assignee doit être un
 *  `TenderParticipant` actif de CE Tender. */
export class InvalidTaskAssigneeError extends DomainError {
  readonly code = "INVALID_TASK_ASSIGNEE";
  constructor() {
    super("Le responsable doit être un participant actif de ce Tender.");
  }
}

export class CommentNotFoundError extends DomainError {
  readonly code = "COMMENT_NOT_FOUND";
  constructor() {
    super("Ce commentaire est introuvable.");
  }
}

export class CommentDeletedError extends DomainError {
  readonly code = "COMMENT_DELETED";
  constructor() {
    super("Ce commentaire a été supprimé.");
  }
}

/** Mission §21 — seul l'auteur peut modifier son propre commentaire (sauf modération admin
 *  explicitement prévue, non implémentée ce sprint). */
export class CommentEditForbiddenError extends DomainError {
  readonly code = "COMMENT_EDIT_FORBIDDEN";
  constructor() {
    super("Seul l'auteur peut modifier ce commentaire.");
  }
}

/** Mission §20 — l'entité ciblée (Task/ChecklistItem) doit appartenir au MÊME Tender/organisation
 *  que le commentaire, jamais un `findUnique({id})` nu. */
export class InvalidCommentEntityError extends DomainError {
  readonly code = "INVALID_COMMENT_ENTITY";
  constructor() {
    super("Cette ressource n'appartient pas à ce Tender.");
  }
}

/** Mission §23 — on ne peut mentionner qu'un utilisateur autorisé sur le contexte (participant
 *  actif de ce Tender), jamais un utilisateur sans accès, même explicitement demandé. */
export class InvalidMentionTargetError extends DomainError {
  readonly code = "INVALID_MENTION_TARGET";
  constructor() {
    super("Cet utilisateur ne peut pas être mentionné : il n'a pas accès à ce Tender.");
  }
}

export class ApprovalRequestNotFoundError extends DomainError {
  readonly code = "APPROVAL_REQUEST_NOT_FOUND";
  constructor() {
    super("Cette demande de validation est introuvable.");
  }
}

/** Mission §30 — interdite par défaut pour les validations importantes. */
export class ApprovalAutoValidationForbiddenError extends DomainError {
  readonly code = "APPROVAL_AUTO_VALIDATION_FORBIDDEN";
  constructor() {
    super("Le demandeur ne peut pas être son propre validateur.");
  }
}

/** Mission §29 — le reviewer doit être un participant actif ET disposer de
 *  `ClientPermission.ValidateWorkspace` (jamais un simple CONTRIBUTOR). */
export class ApprovalReviewerNotAuthorizedError extends DomainError {
  readonly code = "APPROVAL_REVIEWER_NOT_AUTHORIZED";
  constructor() {
    super("Ce participant ne dispose pas des droits nécessaires pour valider cette demande.");
  }
}

/** Mission §48 "double approval" — protège contre une double revue concurrente une fois la
 *  première committée. */
export class ApprovalRequestAlreadyReviewedError extends DomainError {
  readonly code = "APPROVAL_REQUEST_ALREADY_REVIEWED";
  constructor() {
    super("Cette demande de validation a déjà été traitée.");
  }
}
