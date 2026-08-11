import type { Prisma } from "@prisma/client";

/**
 * Alias local — la seule fuite volontaire et documentée du type Prisma dans une frontière de
 * port applicatif de ce module : aucune abstraction `TransactionManager` générique n'existe
 * ailleurs dans le code réel (vérifié, absente de tout le repo), et en inventer une ici,
 * non reprise par aucun autre module, serait un second mécanisme parallèle non justifié.
 * `Prisma.TransactionClient` est un type structurel (aucune dépendance runtime) : un module
 * consommateur qui possède déjà son propre `prisma.$transaction(async (tx) => ...)` peut
 * passer ce `tx` tel quel à `OutboxWriter.write` pour obtenir l'atomicité exigée
 * (DATABASE_PATTERNS.md §39).
 */
export type OutboxTransaction = Prisma.TransactionClient;

export type OutboxEventInput = Readonly<{
  eventType: string;
  eventVersion?: number;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
  correlationId?: string | undefined;
}>;

export type ClaimedOutboxEvent = Readonly<{
  id: string;
  organizationId: string;
  eventType: string;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  occurredAt: Date;
  correlationId: string | null;
  attemptCount: number;
}>;

export interface OutboxEventRepository {
  insertMany(input: { organizationId: string; events: OutboxEventInput[] }, tx?: OutboxTransaction): Promise<void>;

  /** DATABASE_PATTERNS.md §40 — `FOR UPDATE SKIP LOCKED`, supporte plusieurs workers concurrents.
   *  Audit Codex OUTBOX-P1-02 — `staleProcessingThresholdMs` : reprend aussi les lignes bloquées en
   *  PROCESSING au-delà de ce seuil (crash worker après claim, avant `markPublished`/
   *  `markFailedAndReschedule`/`moveToDeadLetter`), même motif que
   *  `WebhookDeliveryRepository.claimPendingBatch`/`staleDeliveringThresholdMs`. */
  claimPendingBatch(input: { limit: number; now: Date; staleProcessingThresholdMs: number }): Promise<ClaimedOutboxEvent[]>;

  markPublished(input: { id: string; organizationId: string }): Promise<void>;

  markFailedAndReschedule(input: {
    id: string;
    organizationId: string;
    error: string;
    nextAvailableAt: Date;
    attemptCount: number;
  }): Promise<void>;

  moveToDeadLetter(input: { id: string; organizationId: string; error: string; attemptCount: number }): Promise<void>;

  countPendingOrFailed(input: { organizationId: string }): Promise<number>;
}

export const OUTBOX_EVENT_REPOSITORY = Symbol("OUTBOX_EVENT_REPOSITORY");
