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

/**
 * Checkpoint TENDEROS-2.1-P2.3-E12.4 — FIX-3B. Un `eventType` absent d'`OUTBOX_EVENT_CATALOG` est un
 * DÉFAUT DE GOUVERNANCE, jamais une trace tolérée par défaut : le produire signifie qu'un nouveau
 * producteur a été livré sans déclarer l'intention de son événement. Traité comme une erreur (donc
 * retry puis DEAD_LETTER, comportement historique) — jamais un succès silencieux, ce qui reviendrait
 * à réintroduire exactement le faux succès que le correctif P1-002 avait supprimé.
 */
export class UncatalogedOutboxEventTypeError extends DomainError {
  readonly code = "UNCATALOGED_OUTBOX_EVENT_TYPE";
  constructor(eventType: string) {
    super(`Outbox event type "${eventType}" is not declared in OUTBOX_EVENT_CATALOG.`);
  }
}

/**
 * Checkpoint TENDEROS-2.1-P2.3-E12.4 — FIX-3B. Le catalogue déclare qu'aucune livraison interne
 * n'est attendue (AUDIT_ONLY/LEGACY) mais un handler est pourtant enregistré : deux sources de
 * vérité se contredisent. Exécuter le handler « au cas où » masquerait la contradiction, et
 * l'ignorer perdrait silencieusement un effet réel — l'erreur explicite est la seule issue sûre.
 */
export class ContradictoryOutboxCatalogEntryError extends DomainError {
  readonly code = "CONTRADICTORY_OUTBOX_CATALOG_ENTRY";
  constructor(eventType: string) {
    super(`Outbox event type "${eventType}" is cataloged as requiring no internal delivery, yet a handler is registered for it.`);
  }
}
