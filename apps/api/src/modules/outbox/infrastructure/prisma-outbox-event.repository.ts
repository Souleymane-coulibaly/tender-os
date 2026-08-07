import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { OutboxEventStatus } from "../domain/outbox-event-status";
import type { ClaimedOutboxEvent, OutboxEventInput, OutboxEventRepository, OutboxTransaction } from "../application/ports/outbox-event.repository";

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

@Injectable()
export class PrismaOutboxEventRepository implements OutboxEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insertMany(input: { organizationId: string; events: OutboxEventInput[] }, tx?: OutboxTransaction): Promise<void> {
    if (input.events.length === 0) {
      return;
    }
    // V2 Sprint 4 (audit Codex P1-001, round 4) — priorité au `tx` explicite déjà établi (ex.
    // AiSuggestion Accept/Modify/Reject, round 3), sinon rejoint la transaction ambiante active
    // (ApplyAiSuggestionUseCase) si présente, voir PrismaService.currentClient().
    const client = tx ?? this.prisma.currentClient();
    await client.outboxEvent.createMany({
      data: input.events.map((event) => ({
        id: randomUUID(),
        organizationId: input.organizationId,
        eventType: event.eventType,
        eventVersion: event.eventVersion ?? 1,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: event.payload as Prisma.InputJsonValue,
        occurredAt: event.occurredAt,
        correlationId: event.correlationId ?? null,
        status: OutboxEventStatus.Pending,
      })),
    });
  }

  async claimPendingBatch(input: { limit: number; now: Date }): Promise<ClaimedOutboxEvent[]> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ClaimedRow[]>`
        SELECT id, organization_id, event_type, event_version, aggregate_type, aggregate_id,
               payload, occurred_at, correlation_id, attempt_count
        FROM outbox_events
        WHERE status IN ('PENDING', 'FAILED') AND available_at <= ${input.now}
        ORDER BY created_at
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      `;

      if (rows.length === 0) {
        return [];
      }

      await tx.outboxEvent.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: { status: OutboxEventStatus.Processing },
      });

      return rows.map(
        (row): ClaimedOutboxEvent => ({
          id: row.id,
          organizationId: row.organization_id,
          eventType: row.event_type,
          eventVersion: row.event_version,
          aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id,
          payload: row.payload,
          occurredAt: row.occurred_at,
          correlationId: row.correlation_id,
          attemptCount: row.attempt_count,
        }),
      );
    });
  }

  async markPublished(input: { id: string; organizationId: string }): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: { id: input.id, organizationId: input.organizationId },
      data: { status: OutboxEventStatus.Published, publishedAt: new Date() },
    });
  }

  async markFailedAndReschedule(input: { id: string; organizationId: string; error: string; nextAvailableAt: Date; attemptCount: number }): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: { id: input.id, organizationId: input.organizationId },
      data: {
        status: OutboxEventStatus.Failed,
        attemptCount: input.attemptCount,
        availableAt: input.nextAvailableAt,
        lastError: input.error.slice(0, 2000),
      },
    });
  }

  async moveToDeadLetter(input: { id: string; organizationId: string; error: string; attemptCount: number }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const event = await tx.outboxEvent.findUnique({ where: { id: input.id } });
      if (!event || event.organizationId !== input.organizationId) {
        return;
      }

      await tx.outboxEvent.updateMany({
        where: { id: input.id, organizationId: input.organizationId },
        data: { status: OutboxEventStatus.DeadLetter, attemptCount: input.attemptCount, lastError: input.error.slice(0, 2000) },
      });

      await tx.deadLetterEvent.create({
        data: {
          id: randomUUID(),
          organizationId: input.organizationId,
          outboxEventId: event.id,
          eventType: event.eventType,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          payload: event.payload as Prisma.InputJsonValue,
          failureReason: input.error.slice(0, 2000),
          attemptCount: input.attemptCount,
        },
      });
    });
  }

  async countPendingOrFailed(input: { organizationId: string }): Promise<number> {
    return this.prisma.outboxEvent.count({
      where: { organizationId: input.organizationId, status: { in: [OutboxEventStatus.Pending, OutboxEventStatus.Failed] } },
    });
  }
}
