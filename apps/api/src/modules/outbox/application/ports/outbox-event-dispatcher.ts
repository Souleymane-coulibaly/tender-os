/**
 * Point d'extension pour les futurs consommateurs (Sprint 7+) : le worker de publication
 * (`PublishPendingOutboxEventsUseCase`, exécuté automatiquement par `OutboxPublisherWorker`)
 * délègue chaque événement claimé à ce port, jamais l'inverse — un module consommateur n'a jamais
 * besoin de connaître le mécanisme de claim/retry. Implémentation par défaut :
 * `CompositeOutboxEventDispatcher` (infrastructure), qui route vers un `OutboxEventHandler`
 * enregistré par `eventType` — un événement sans handler enregistré n'est jamais marqué PUBLISHED
 * silencieusement (correctif audit Codex P1-002, voir `NoOutboxHandlerRegisteredError`).
 */
export type OutboxEventToDispatch = Readonly<{
  id: string;
  organizationId: string;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  occurredAt: Date;
  correlationId: string | null;
}>;

export interface OutboxEventDispatcher {
  dispatch(event: OutboxEventToDispatch): Promise<void>;
}

export const OUTBOX_EVENT_DISPATCHER = Symbol("OUTBOX_EVENT_DISPATCHER");
