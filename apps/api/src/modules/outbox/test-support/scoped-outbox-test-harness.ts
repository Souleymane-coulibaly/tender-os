import { Prisma, type PrismaClient } from "@prisma/client";
import { computeOutboxBackoffSeconds, OUTBOX_MAX_ATTEMPTS } from "../domain/outbox-event-status";
import type { OutboxEventDispatcher } from "../application/ports/outbox-event-dispatcher";
import { PrismaOutboxEventRepository } from "../infrastructure/prisma-outbox-event.repository";

type EligibleStatus = "PENDING" | "FAILED" | "PROCESSING";

type ClaimedRow = {
  id: string;
  organization_id: string;
  event_type: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  occurred_at: Date;
  correlation_id: string | null;
  attempt_count: number;
};

export type PublishScopedOutboxEventsResult = Readonly<{
  requested: number;
  claimed: number;
  published: number;
  failed: number;
  deadLettered: number;
}>;

export async function listOutboxEventIds(input: {
  prisma: PrismaClient;
  organizationId: string;
  eventTypes?: readonly string[];
  aggregateId?: string;
  since?: Date;
}): Promise<string[]> {
  const rows = await input.prisma.outboxEvent.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.eventTypes ? { eventType: { in: [...input.eventTypes] } } : {}),
      ...(input.aggregateId ? { aggregateId: input.aggregateId } : {}),
      ...(input.since ? { createdAt: { gte: input.since } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

export async function publishOutboxEventsByIds(input: {
  prisma: PrismaClient;
  dispatcher: OutboxEventDispatcher;
  eventIds: readonly string[];
  now?: Date;
  staleProcessingThresholdMs?: number;
}): Promise<PublishScopedOutboxEventsResult> {
  if (input.eventIds.length === 0) {
    return { requested: 0, claimed: 0, published: 0, failed: 0, deadLettered: 0 };
  }

  const now = input.now ?? new Date();
  const staleProcessingThresholdMs = input.staleProcessingThresholdMs ?? 5 * 60 * 1000;
  const leaseExpiresAt = new Date(now.getTime() + staleProcessingThresholdMs);
  const repository = new PrismaOutboxEventRepository(input.prisma as never);

  const requestedIds = [...new Set(input.eventIds)];
  const claimed = await input.prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ClaimedRow[]>(Prisma.sql`
      SELECT id, organization_id, event_type, event_version, aggregate_type, aggregate_id,
             payload, occurred_at, correlation_id, attempt_count
      FROM outbox_events
      WHERE id IN (${Prisma.join(requestedIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND status IN (${Prisma.sql`${"PENDING"}`}, ${Prisma.sql`${"FAILED"}`}, ${Prisma.sql`${"PROCESSING"}`})
        AND available_at <= ${now}
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
    `);

    if (rows.length === 0) {
      return [];
    }

    await tx.outboxEvent.updateMany({
      where: { id: { in: rows.map((row) => row.id) } },
      data: { status: "PROCESSING" satisfies EligibleStatus, availableAt: leaseExpiresAt },
    });

    return rows;
  });

  let published = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const event of claimed) {
    try {
      await input.dispatcher.dispatch({
        id: event.id,
        organizationId: event.organization_id,
        eventType: event.event_type,
        eventVersion: event.event_version,
        aggregateType: event.aggregate_type,
        aggregateId: event.aggregate_id,
        payload: event.payload,
        occurredAt: event.occurred_at,
        correlationId: event.correlation_id,
      });
      await repository.markPublished({ id: event.id, organizationId: event.organization_id });
      published += 1;
    } catch (error) {
      const attemptCount = event.attempt_count + 1;
      const message = error instanceof Error ? error.message : String(error);
      if (attemptCount >= OUTBOX_MAX_ATTEMPTS) {
        await repository.moveToDeadLetter({ id: event.id, organizationId: event.organization_id, error: message, attemptCount });
        deadLettered += 1;
      } else {
        const backoffSeconds = computeOutboxBackoffSeconds(attemptCount);
        const nextAvailableAt = new Date(now.getTime() + backoffSeconds * 1000);
        await repository.markFailedAndReschedule({
          id: event.id,
          organizationId: event.organization_id,
          error: message,
          nextAvailableAt,
          attemptCount,
        });
        failed += 1;
      }
    }
  }

  return { requested: requestedIds.length, claimed: claimed.length, published, failed, deadLettered };
}
