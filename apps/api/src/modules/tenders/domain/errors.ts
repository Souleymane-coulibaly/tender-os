import { DomainError } from "../../../shared-kernel/domain-error";

export class TenderNotFoundError extends DomainError {
  readonly code = "TENDER_NOT_FOUND";
  constructor() {
    super("Tender not found.");
  }
}

export class InvalidTenderStatusTransitionError extends DomainError {
  readonly code = "INVALID_TENDER_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition tender from ${input.from} to ${input.to}.`);
  }
}

export class TenderArchivedError extends DomainError {
  readonly code = "TENDER_ARCHIVED";
  constructor() {
    super("Archived tenders cannot be modified.");
  }
}

export class TenderConcurrentModificationError extends DomainError {
  readonly code = "TENDER_CONCURRENT_MODIFICATION";
  constructor() {
    super("This tender was modified concurrently by another request. Reload and retry.");
  }
}

export class InvalidTenderStatusError extends DomainError {
  readonly code = "INVALID_TENDER_STATUS";
  constructor(value: string) {
    super(`"${value}" is not a valid tender status.`);
  }
}

export class TenderPermissionMissingError extends DomainError {
  readonly code = "TENDER_PERMISSION_MISSING";
  constructor(input: { permission: string }) {
    super(`Missing permission: ${input.permission}.`);
  }
}

export class TenderLotNotFoundError extends DomainError {
  readonly code = "TENDER_LOT_NOT_FOUND";
  constructor() {
    super("Tender lot not found.");
  }
}

export class DuplicateTenderLotNumberError extends DomainError {
  readonly code = "DUPLICATE_TENDER_LOT_NUMBER";
  constructor() {
    super("A lot with this number already exists for this tender.");
  }
}

export class ChecklistItemNotFoundError extends DomainError {
  readonly code = "CHECKLIST_ITEM_NOT_FOUND";
  constructor() {
    super("Checklist item not found.");
  }
}

export class AwardCriterionNotFoundError extends DomainError {
  readonly code = "AWARD_CRITERION_NOT_FOUND";
  constructor() {
    super("Award criterion not found.");
  }
}

export class RequestedDocumentNotFoundError extends DomainError {
  readonly code = "REQUESTED_DOCUMENT_NOT_FOUND";
  constructor() {
    super("Requested document not found.");
  }
}

export class MilestoneNotFoundError extends DomainError {
  readonly code = "MILESTONE_NOT_FOUND";
  constructor() {
    super("Milestone not found.");
  }
}

export class RiskNotFoundError extends DomainError {
  readonly code = "RISK_NOT_FOUND";
  constructor() {
    super("Risk not found.");
  }
}

export class AlertNotFoundError extends DomainError {
  readonly code = "ALERT_NOT_FOUND";
  constructor() {
    super("Alert not found.");
  }
}
