import { DomainError } from "../../../shared-kernel/domain-error";

export class SavedSearchNotFoundError extends DomainError {
  readonly code = "SAVED_SEARCH_NOT_FOUND";
  constructor() {
    super("Saved search not found.");
  }
}

export class ExternalTenderNotFoundError extends DomainError {
  readonly code = "EXTERNAL_TENDER_NOT_FOUND";
  constructor() {
    super("External tender not found.");
  }
}

export class SavedSearchMatchNotFoundError extends DomainError {
  readonly code = "SAVED_SEARCH_MATCH_NOT_FOUND";
  constructor() {
    super("Saved search match not found.");
  }
}

export class MarketWatchPermissionMissingError extends DomainError {
  readonly code = "MARKET_WATCH_PERMISSION_MISSING";
  constructor() {
    super("Actor does not have the required market watch permission.");
  }
}

export class InvalidEmailFrequencyError extends DomainError {
  readonly code = "INVALID_EMAIL_FREQUENCY";
  constructor(value: string) {
    super(`"${value}" is not a recognized email frequency.`);
  }
}

/** Mission §56 — jamais une duplication silencieuse : l'appelant doit soit annuler, soit
 *  confirmer explicitement (`confirmDuplicate: true`) après avoir vu l'Opportunity existante. */
export class ExternalTenderAlreadyPromotedError extends DomainError {
  readonly code = "EXTERNAL_TENDER_ALREADY_PROMOTED";
  constructor(readonly existingOpportunityId: string) {
    super("This external tender was already promoted to an Opportunity for this client.");
  }
}
