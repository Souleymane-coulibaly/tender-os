import { DomainError } from "../../../shared-kernel/domain-error";

export class DeliverableNotFoundError extends DomainError {
  readonly code = "DELIVERABLE_NOT_FOUND";
  constructor() {
    super("Deliverable not found.");
  }
}

export class DuplicateDeliverableError extends DomainError {
  readonly code = "DUPLICATE_DELIVERABLE";
  constructor() {
    super("A deliverable of this type already exists for this tender.");
  }
}

export class DeliverableSectionNotFoundError extends DomainError {
  readonly code = "DELIVERABLE_SECTION_NOT_FOUND";
  constructor() {
    super("Deliverable section not found.");
  }
}

export class DuplicateDeliverableSectionError extends DomainError {
  readonly code = "DUPLICATE_DELIVERABLE_SECTION";
  constructor() {
    super("A section with this code already exists on this deliverable.");
  }
}

export class DeliverableSectionLockedError extends DomainError {
  readonly code = "DELIVERABLE_SECTION_LOCKED";
  constructor() {
    super("This section is locked and cannot be modified.");
  }
}

export class DeliverableRevisionNotFoundError extends DomainError {
  readonly code = "DELIVERABLE_REVISION_NOT_FOUND";
  constructor() {
    super("Deliverable revision not found.");
  }
}

/** Mission Sprint 8A.1 §10 — "une ancienne révision ne doit jamais être écrasée" : toute tentative
 *  d'éditer une révision qui n'est plus au statut DRAFT est refusée, jamais silencieusement ignorée. */
export class ImmutableRevisionError extends DomainError {
  readonly code = "IMMUTABLE_DELIVERABLE_REVISION";
  constructor() {
    super("Only a DRAFT revision can be edited — create a new revision instead of mutating a non-draft one.");
  }
}

/** Mission §18 — concurrence d'édition : un `editVersion` client obsolète produit un conflit
 *  explicite, jamais un écrasement silencieux. */
export class RevisionEditConflictError extends DomainError {
  readonly code = "DELIVERABLE_REVISION_EDIT_CONFLICT";
  constructor() {
    super("This revision was modified by someone else since you loaded it — reload and re-apply your changes.");
  }
}

export class InvalidDeliverableRevisionStatusTransitionError extends DomainError {
  readonly code = "INVALID_DELIVERABLE_REVISION_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition deliverable revision from ${input.from} to ${input.to}.`);
  }
}

/** Mission §11 — "aucune sélection automatique d'un brouillon non validé" pour l'export. */
export class RevisionNotValidatedForExportError extends DomainError {
  readonly code = "DELIVERABLE_REVISION_NOT_VALIDATED_FOR_EXPORT";
  constructor() {
    super("Only a VALIDATED revision can be selected for export.");
  }
}

export class DeliverableReviewRequiresReadyRevisionError extends DomainError {
  readonly code = "DELIVERABLE_REVIEW_REQUIRES_READY_REVISION";
  constructor() {
    super("A review decision requires the revision to be READY_FOR_REVIEW.");
  }
}

export class DeliverableCommentNotFoundError extends DomainError {
  readonly code = "DELIVERABLE_COMMENT_NOT_FOUND";
  constructor() {
    super("Deliverable comment not found.");
  }
}

export class DeliverableCommentAlreadyResolvedError extends DomainError {
  readonly code = "DELIVERABLE_COMMENT_ALREADY_RESOLVED";
  constructor() {
    super("This comment is already resolved.");
  }
}

export class DeliverableTemplateNotFoundError extends DomainError {
  readonly code = "DELIVERABLE_TEMPLATE_NOT_FOUND";
  constructor() {
    super("Deliverable template not found.");
  }
}

export class DeliverableTemplateVersionNotFoundError extends DomainError {
  readonly code = "DELIVERABLE_TEMPLATE_VERSION_NOT_FOUND";
  constructor() {
    super("Deliverable template version not found.");
  }
}

export class NoActiveDeliverableTemplateVersionError extends DomainError {
  readonly code = "NO_ACTIVE_DELIVERABLE_TEMPLATE_VERSION";
  constructor() {
    super("No active version exists for this deliverable template.");
  }
}

export class InvalidVersionLifecycleTransitionError extends DomainError {
  readonly code = "INVALID_VERSION_LIFECYCLE_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition version from ${input.from} to ${input.to}.`);
  }
}

export class DeliverableTemplateVersionActivationConflictError extends DomainError {
  readonly code = "DELIVERABLE_TEMPLATE_VERSION_ACTIVATION_CONFLICT";
  constructor() {
    super("Another version was activated concurrently for this template.");
  }
}

export class DocumentThemeNotFoundError extends DomainError {
  readonly code = "DOCUMENT_THEME_NOT_FOUND";
  constructor() {
    super("Document theme not found.");
  }
}

export class DocumentThemeVersionNotFoundError extends DomainError {
  readonly code = "DOCUMENT_THEME_VERSION_NOT_FOUND";
  constructor() {
    super("Document theme version not found.");
  }
}

export class DocumentThemeVersionActivationConflictError extends DomainError {
  readonly code = "DOCUMENT_THEME_VERSION_ACTIVATION_CONFLICT";
  constructor() {
    super("Another version was activated concurrently for this theme.");
  }
}

/** Mission §6 — "une version déjà utilisée dans un export final est immuable". */
export class ThemeVersionAlreadyUsedInFinalExportError extends DomainError {
  readonly code = "THEME_VERSION_ALREADY_USED_IN_FINAL_EXPORT";
  constructor() {
    super("This theme version was already used in a final export and can no longer be modified.");
  }
}

export class InvalidDeliverableTemplateConfigError extends DomainError {
  readonly code = "INVALID_DELIVERABLE_TEMPLATE_CONFIG";
  constructor(reason: string) {
    super(`Invalid deliverable template section configuration: ${reason}`);
  }
}

export class DeliverablePermissionMissingError extends DomainError {
  readonly code = "DELIVERABLE_PERMISSION_MISSING";
  constructor() {
    super("Actor lacks the required deliverable permission for this action.");
  }
}

export class CrossClientDeliverableContentError extends DomainError {
  readonly code = "CROSS_CLIENT_DELIVERABLE_CONTENT";
  constructor() {
    super("A referenced item belongs to a different client — refused.");
  }
}

export class ComplianceMatrixEntryNotFoundError extends DomainError {
  readonly code = "COMPLIANCE_MATRIX_ENTRY_NOT_FOUND";
  constructor() {
    super("Compliance matrix entry not found.");
  }
}

export class ChecklistPieceEntryNotFoundError extends DomainError {
  readonly code = "CHECKLIST_PIECE_ENTRY_NOT_FOUND";
  constructor() {
    super("Checklist piece entry not found.");
  }
}

export class DeliverableAnnexNotFoundError extends DomainError {
  readonly code = "DELIVERABLE_ANNEX_NOT_FOUND";
  constructor() {
    super("Deliverable annex not found.");
  }
}

/** Mission §7 — une section ne peut être générée par IA que si un `taskType` est connu, soit fourni
 *  explicitement, soit configuré sur la section de template correspondante. */
export class SectionTaskTypeNotConfiguredError extends DomainError {
  readonly code = "SECTION_TASK_TYPE_NOT_CONFIGURED";
  constructor() {
    super("No AI task type is configured for this section — provide one explicitly or configure it on the template section.");
  }
}

/** Mission §7/§8 — la génération référencée doit appartenir à cette section précise, au même
 *  client, et être réellement terminée avant qu'une révision puisse en être créée. */
export class GenerationNotUsableForRevisionError extends DomainError {
  readonly code = "GENERATION_NOT_USABLE_FOR_REVISION";
  constructor(reason: string) {
    super(`This generation cannot be used to create a revision: ${reason}`);
  }
}

export class UnsupportedReadOnlyDeliverableError extends DomainError {
  readonly code = "UNSUPPORTED_READ_ONLY_DELIVERABLE";
  constructor(reason: string) {
    super(`This read-only deliverable view is unavailable: ${reason}`);
  }
}

/** Mission §15 — un livrable ne peut être approuvé que si toutes ses sections visibles sont
 *  VALIDÉES, jamais un état intermédiaire. */
export class DeliverableNotReadyForApprovalError extends DomainError {
  readonly code = "DELIVERABLE_NOT_READY_FOR_APPROVAL";
  constructor() {
    super("This deliverable cannot be approved yet — every visible section must be VALIDATED first.");
  }
}

/** Correctif audit Codex P1-004 — le palier `TENDEROS` est une ressource système, jamais créable ni
 *  modifiable par une organisation tenant via l'API — seul un repli en lecture pour le résolveur. */
export class SystemScopeNotTenantCreatableError extends DomainError {
  readonly code = "SYSTEM_SCOPE_NOT_TENANT_CREATABLE";
  constructor() {
    super("The TENDEROS scope is a system resource and cannot be created or modified by a tenant organization.");
  }
}

/** Correctif audit Codex P1-003 — un `documentId` attaché à une checklist/annexe doit référencer un
 *  document réellement exploitable (existe, non supprimé, au moins une version) — jamais une simple
 *  chaîne non vérifiée. */
export class DocumentNotUsableForDeliverableError extends DomainError {
  readonly code = "DOCUMENT_NOT_USABLE_FOR_DELIVERABLE";
  constructor(reason: string) {
    super(`This document cannot be attached: ${reason}`);
  }
}

/** Correctif audit Codex P1-002 — le rapport financier référence une version Sprint 7 FIGÉE,
 *  immuable une fois sélectionnée : une seconde sélection portant sur une autre estimation/version
 *  est refusée, jamais un remplacement silencieux d'un rapport déjà figé. */
export class DeliverableCostReportAlreadyFrozenError extends DomainError {
  readonly code = "DELIVERABLE_COST_REPORT_ALREADY_FROZEN";
  constructor() {
    super("This deliverable's cost report already references a frozen pricing estimate version — it cannot be changed.");
  }
}
