import type { OutboxEventInput, OutboxTransaction } from "./outbox-event.repository";

export type { OutboxEventInput, OutboxTransaction };

/**
 * API publique du module Outbox pour tout module producteur d'événements
 * (mission Sprint 1 §2 — "un mécanisme permettant aux futurs modules de publier des événements
 * sans dépendre directement de l'infrastructure de traitement"). Un module futur importe
 * uniquement `OutboxModule` + ce type, jamais le repository ni le worker.
 */
export interface OutboxWriter {
  write(input: { organizationId: string; events: OutboxEventInput[] }, tx?: OutboxTransaction): Promise<void>;
}

export const OUTBOX_WRITER = Symbol("OUTBOX_WRITER");
