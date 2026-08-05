import type { OutboxEventToDispatch } from "./outbox-event-dispatcher";

/**
 * Correctif audit Codex P1-002 — un module consommateur (Sprint 7+) enregistre un handler pour
 * le(s) `eventType` qu'il sait traiter. `CompositeOutboxEventDispatcher` (infrastructure) route
 * chaque événement claimé vers le handler correspondant — jamais un succès silencieux pour un
 * type sans handler (voir `NoOutboxHandlerRegisteredError`).
 */
export interface OutboxEventHandler {
  readonly eventType: string;
  handle(event: OutboxEventToDispatch): Promise<void>;
}

export const OUTBOX_EVENT_HANDLERS = Symbol("OUTBOX_EVENT_HANDLERS");
