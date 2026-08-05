import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { computeOutboxBackoffSeconds, OUTBOX_MAX_ATTEMPTS } from "../../domain/outbox-event-status";
import { OUTBOX_EVENT_DISPATCHER, type OutboxEventDispatcher } from "../ports/outbox-event-dispatcher";
import { OUTBOX_EVENT_REPOSITORY, type OutboxEventRepository } from "../ports/outbox-event.repository";

export type PublishPendingOutboxEventsResult = Readonly<{
  claimed: number;
  published: number;
  failed: number;
  deadLettered: number;
}>;

/**
 * Un "tick" du publisher (DATABASE_PATTERNS.md §40) : claim un lot, tente la dispatch de chacun,
 * journalise et re-planifie/dead-letter selon le résultat. Jamais de perte silencieuse — chaque
 * chemin (succès/échec/dead-letter) est explicite et journalisé (mission Sprint 1 §2).
 */
@Injectable()
export class PublishPendingOutboxEventsUseCase {
  private readonly logger = new Logger(PublishPendingOutboxEventsUseCase.name);

  constructor(
    @Inject(OUTBOX_EVENT_REPOSITORY) private readonly repository: OutboxEventRepository,
    @Inject(OUTBOX_EVENT_DISPATCHER) private readonly dispatcher: OutboxEventDispatcher,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: { batchSize?: number } = {}): Promise<PublishPendingOutboxEventsResult> {
    const limit = input.batchSize ?? 100;
    const now = this.clock.now();
    const claimed = await this.repository.claimPendingBatch({ limit, now });

    let published = 0;
    let failed = 0;
    let deadLettered = 0;

    for (const event of claimed) {
      try {
        await this.dispatcher.dispatch({
          id: event.id,
          organizationId: event.organizationId,
          eventType: event.eventType,
          eventVersion: event.eventVersion,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          payload: event.payload,
          occurredAt: event.occurredAt,
          correlationId: event.correlationId,
        });
        await this.repository.markPublished({ id: event.id, organizationId: event.organizationId });
        published += 1;
      } catch (error) {
        const attemptCount = event.attemptCount + 1;
        const message = error instanceof Error ? error.message : String(error);

        if (attemptCount >= OUTBOX_MAX_ATTEMPTS) {
          await this.repository.moveToDeadLetter({ id: event.id, organizationId: event.organizationId, error: message, attemptCount });
          deadLettered += 1;
          this.logger.error(`Outbox event ${event.id} moved to DEAD_LETTER after ${attemptCount} attempts: ${message}`);
        } else {
          const backoffSeconds = computeOutboxBackoffSeconds(attemptCount);
          const nextAvailableAt = new Date(now.getTime() + backoffSeconds * 1000);
          await this.repository.markFailedAndReschedule({
            id: event.id,
            organizationId: event.organizationId,
            error: message,
            nextAvailableAt,
            attemptCount,
          });
          failed += 1;
          this.logger.warn(`Outbox event ${event.id} failed (attempt ${attemptCount}/${OUTBOX_MAX_ATTEMPTS}), retry at ${nextAvailableAt.toISOString()}: ${message}`);
        }
      }
    }

    return { claimed: claimed.length, published, failed, deadLettered };
  }
}
