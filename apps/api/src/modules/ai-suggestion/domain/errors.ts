import { DomainError } from "../../../shared-kernel/domain-error";

export class AiSuggestionNotFoundError extends DomainError {
  readonly code = "AI_SUGGESTION_NOT_FOUND";
  constructor() {
    super("La suggestion IA est introuvable.");
  }
}

/** Mission Sprint 1 §3 — "empêcher toute modification silencieuse d'une suggestion déjà traitée". */
export class AiSuggestionAlreadyProcessedError extends DomainError {
  readonly code = "AI_SUGGESTION_ALREADY_PROCESSED";
  constructor() {
    super("Cette suggestion IA a déjà été traitée et ne peut plus être modifiée.");
  }
}

export class AiSuggestionInvalidProposedValueError extends DomainError {
  readonly code = "AI_SUGGESTION_INVALID_PROPOSED_VALUE";
  constructor(reason: string) {
    super(`La valeur proposée par l'IA n'est pas valide : ${reason}`);
  }
}

/** Correctif audit Codex P1-003 — aucun schéma n'est enregistré pour ce couple
 *  (entityType, fieldName) dans le registre central : la création est refusée plutôt que de
 *  laisser un appelant fournir un schéma ad hoc non gouverné. */
export class AiSuggestionSchemaNotRegisteredError extends DomainError {
  readonly code = "AI_SUGGESTION_SCHEMA_NOT_REGISTERED";
  constructor(entityType: string, fieldName: string) {
    super(`Aucun schéma de validation n'est enregistré pour ${entityType}.${fieldName}.`);
  }
}

export class AiSuggestionPermissionDeniedError extends DomainError {
  readonly code = "AI_SUGGESTION_PERMISSION_DENIED";
  constructor() {
    super("Ce rôle ne permet pas de traiter les suggestions IA.");
  }
}
