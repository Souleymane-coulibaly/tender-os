import { DomainError } from "../../../shared-kernel/domain-error";

export class OutboxEventNotFoundError extends DomainError {
  readonly code = "OUTBOX_EVENT_NOT_FOUND";
  constructor() {
    super("The outbox event was not found.");
  }
}

/** Correctif audit Codex P1-002 — un événement sans handler enregistré n'est jamais marqué
 *  PUBLISHED silencieusement : il suit le chemin d'échec normal (retry puis DEAD_LETTER). */
export class NoOutboxHandlerRegisteredError extends DomainError {
  readonly code = "NO_OUTBOX_HANDLER_REGISTERED";
  constructor(eventType: string) {
    super(`No outbox handler is registered for event type "${eventType}".`);
  }
}
