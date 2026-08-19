import { DomainError } from "../../../shared-kernel/domain-error";

export class OpportunityNotFoundError extends DomainError {
  readonly code = "OPPORTUNITY_NOT_FOUND";
  constructor() {
    super("Opportunity not found.");
  }
}

export class InvalidOpportunityStatusError extends DomainError {
  readonly code = "INVALID_OPPORTUNITY_STATUS";
  constructor(value: string) {
    super(`"${value}" is not a valid opportunity status.`);
  }
}

export class InvalidOpportunityStatusTransitionError extends DomainError {
  readonly code = "INVALID_OPPORTUNITY_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition opportunity from ${input.from} to ${input.to}.`);
  }
}

export class InvalidOpportunityEstimatedAmountError extends DomainError {
  readonly code = "INVALID_OPPORTUNITY_ESTIMATED_AMOUNT";
  constructor(input: { value: string }) {
    super(`"${input.value}" is not a valid estimated amount.`);
  }
}

export class InvalidOpportunitySourceError extends DomainError {
  readonly code = "INVALID_OPPORTUNITY_SOURCE";
  constructor(value: string) {
    super(`"${value}" is not a valid opportunity source.`);
  }
}

export class OpportunityArchivedError extends DomainError {
  readonly code = "OPPORTUNITY_ARCHIVED";
  constructor() {
    super("Archived opportunities cannot be modified.");
  }
}

export class OpportunityConcurrentModificationError extends DomainError {
  readonly code = "OPPORTUNITY_CONCURRENT_MODIFICATION";
  constructor() {
    super("This opportunity was modified concurrently by another request. Reload and retry.");
  }
}

export class OpportunityPermissionMissingError extends DomainError {
  readonly code = "OPPORTUNITY_PERMISSION_MISSING";
  constructor(input: { permission: string }) {
    super(`Missing permission: ${input.permission}.`);
  }
}

/** Mission §18 — une justification est obligatoire pour toute décision NO_GO, jamais optionnelle. */
export class GoNoGoDecisionJustificationRequiredError extends DomainError {
  readonly code = "GO_NO_GO_DECISION_JUSTIFICATION_REQUIRED";
  constructor() {
    super("A justification is required when recording a NO_GO decision.");
  }
}

/** Mission §18 — des conditions sont obligatoires pour toute décision GO_CONDITIONAL. */
export class GoNoGoDecisionConditionsRequiredError extends DomainError {
  readonly code = "GO_NO_GO_DECISION_CONDITIONS_REQUIRED";
  constructor() {
    super("Conditions are required when recording a GO_CONDITIONAL decision.");
  }
}

export class InvalidGoNoGoDecisionError extends DomainError {
  readonly code = "INVALID_GO_NO_GO_DECISION";
  constructor(value: string) {
    super(`"${value}" is not a valid GO/NO-GO decision.`);
  }
}

/** Audit Codex round 2 (P1 confirmé) — un OWNER/ORGANIZATION_ADMIN qui enregistre une décision ou
 *  promeut SANS affectation CLIENT_MANAGER active sur ce client agit via son "privilège
 *  d'administration" (filet de sécurité anti-lockout, jamais accordé à BID_MANAGER/CONTRIBUTOR) —
 *  ce contournement exige TOUJOURS une justification explicite, quelle que soit la décision, en
 *  plus d'être tracé dans l'AuditLog (voir `resolveGoNoGoClientAccess`). */
export class GoNoGoAdminBypassJustificationRequiredError extends DomainError {
  readonly code = "GO_NO_GO_ADMIN_BYPASS_JUSTIFICATION_REQUIRED";
  constructor() {
    super("A justification is required when acting without an active CLIENT_MANAGER assignment on this client (administrative bypass).");
  }
}

/** Mission §19 — aucune dérogation ce sprint : une Opportunity dont la dernière décision est
 *  NO_GO (ou qui n'a jamais reçu de décision GO/GO_CONDITIONAL) ne peut jamais être promue. */
export class OpportunityPromotionRequiresGoDecisionError extends DomainError {
  readonly code = "OPPORTUNITY_PROMOTION_REQUIRES_GO_DECISION";
  constructor() {
    super("An Opportunity can only be promoted to a Tender when its latest recorded decision is GO or GO_CONDITIONAL.");
  }
}

export class OpportunityMissingClientAccountError extends DomainError {
  readonly code = "OPPORTUNITY_MISSING_CLIENT_ACCOUNT";
  constructor() {
    super("A candidate company (ClientAccount) must be resolved on the Opportunity before it can be promoted.");
  }
}

export class OpportunityPromotionConflictError extends DomainError {
  readonly code = "OPPORTUNITY_PROMOTION_CONFLICT";
  constructor() {
    super("This opportunity is no longer in a state that allows promotion.");
  }
}

export class GoNoGoReportNotFoundError extends DomainError {
  readonly code = "GO_NO_GO_REPORT_NOT_FOUND";
  constructor() {
    super("No GO/NO-GO report has been generated for this tender yet.");
  }
}

/** Checkpoint 2.1-P2.1-FIX-C (mission §28-29) — un GO/NO-GO ne peut jamais être généré/recalculé
 *  à partir d'une analyse qui n'est pas `CURRENT` (STALE ou UNKNOWN bloquent tous les deux, mission
 *  §37 "ne pas produire un faux GO/NO-GO CURRENT" — choix conservateur : bloquer plutôt que produire
 *  un rapport dont la fraîcheur ne pourrait jamais être prouvée). L'utilisateur doit d'abord
 *  actualiser l'analyse (refresh DCE -> réanalyse) avant de pouvoir recalculer. */
export class GoNoGoAnalysisNotCurrentError extends DomainError {
  readonly code = "GO_NO_GO_ANALYSIS_NOT_CURRENT";
  constructor() {
    super("The GO/NO-GO report cannot be generated while the source analysis is not CURRENT. Refresh the DCE analysis first.");
  }
}

export class OpportunityQuickScoreNotFoundError extends DomainError {
  readonly code = "OPPORTUNITY_QUICK_SCORE_NOT_FOUND";
  constructor() {
    super("No quick score has been computed for this opportunity yet.");
  }
}
