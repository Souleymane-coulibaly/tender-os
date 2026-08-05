import { describe, expect, it } from "vitest";
import type { OutboxEventDispatcher, OutboxEventToDispatch } from "../ports/outbox-event-dispatcher";
import type { ClaimedOutboxEvent, OutboxEventRepository } from "../ports/outbox-event.repository";
import { PublishPendingOutboxEventsUseCase } from "./publish-pending-outbox-events.use-case";

function claimedEvent(overrides: Partial<ClaimedOutboxEvent> = {}): ClaimedOutboxEvent {
  return {
    id: "event-1",
    organizationId: "org-1",
    eventType: "TEST_EVENT",
    eventVersion: 1,
    aggregateType: "TestAggregate",
    aggregateId: "agg-1",
    payload: { foo: "bar" },
    occurredAt: new Date("2026-08-05T10:00:00.000Z"),
    correlationId: null,
    attemptCount: 0,
    ...overrides,
  };
}

class FakeOutboxEventRepository implements OutboxEventRepository {
  claimed: ClaimedOutboxEvent[] = [];
  published: string[] = [];
  failedAndRescheduled: Array<{ id: string; attemptCount: number }> = [];
  deadLettered: Array<{ id: string; attemptCount: number }> = [];

  async insertMany(): Promise<void> {}

  async claimPendingBatch(): Promise<ClaimedOutboxEvent[]> {
    return this.claimed;
  }

  async markPublished(input: { id: string }): Promise<void> {
    this.published.push(input.id);
  }

  async markFailedAndReschedule(input: { id: string; attemptCount: number }): Promise<void> {
    this.failedAndRescheduled.push({ id: input.id, attemptCount: input.attemptCount });
  }

  async moveToDeadLetter(input: { id: string; attemptCount: number }): Promise<void> {
    this.deadLettered.push({ id: input.id, attemptCount: input.attemptCount });
  }

  async countPendingOrFailed(): Promise<number> {
    return this.claimed.length;
  }
}

class FakeDispatcher implements OutboxEventDispatcher {
  constructor(private readonly shouldFail: (event: OutboxEventToDispatch) => boolean = () => false) {}

  async dispatch(event: OutboxEventToDispatch): Promise<void> {
    if (this.shouldFail(event)) {
      throw new Error("dispatch failed");
    }
  }
}

class FixedClock {
  now(): Date {
    return new Date("2026-08-05T12:00:00.000Z");
  }
}

describe("PublishPendingOutboxEventsUseCase", () => {
  it("marks a successfully dispatched event as published", async () => {
    const repository = new FakeOutboxEventRepository();
    repository.claimed = [claimedEvent()];
    const useCase = new PublishPendingOutboxEventsUseCase(repository, new FakeDispatcher(), new FixedClock());

    const result = await useCase.execute();

    expect(result).toEqual({ claimed: 1, published: 1, failed: 0, deadLettered: 0 });
    expect(repository.published).toEqual(["event-1"]);
  });

  it("reschedules a failed event with an incremented attempt count when under the dead-letter threshold", async () => {
    const repository = new FakeOutboxEventRepository();
    repository.claimed = [claimedEvent({ attemptCount: 1 })];
    const useCase = new PublishPendingOutboxEventsUseCase(repository, new FakeDispatcher(() => true), new FixedClock());

    const result = await useCase.execute();

    expect(result).toEqual({ claimed: 1, published: 0, failed: 1, deadLettered: 0 });
    expect(repository.failedAndRescheduled).toEqual([{ id: "event-1", attemptCount: 2 }]);
    expect(repository.deadLettered).toHaveLength(0);
  });

  it("moves an event to dead-letter once the attempt threshold is reached", async () => {
    const repository = new FakeOutboxEventRepository();
    repository.claimed = [claimedEvent({ attemptCount: 4 })];
    const useCase = new PublishPendingOutboxEventsUseCase(repository, new FakeDispatcher(() => true), new FixedClock());

    const result = await useCase.execute();

    expect(result).toEqual({ claimed: 1, published: 0, failed: 0, deadLettered: 1 });
    expect(repository.deadLettered).toEqual([{ id: "event-1", attemptCount: 5 }]);
    expect(repository.failedAndRescheduled).toHaveLength(0);
  });

  it("processes an empty batch without error", async () => {
    const repository = new FakeOutboxEventRepository();
    const useCase = new PublishPendingOutboxEventsUseCase(repository, new FakeDispatcher(), new FixedClock());

    const result = await useCase.execute();

    expect(result).toEqual({ claimed: 0, published: 0, failed: 0, deadLettered: 0 });
  });

  it("handles a mixed batch independently per event", async () => {
    const repository = new FakeOutboxEventRepository();
    repository.claimed = [claimedEvent({ id: "ok", attemptCount: 0 }), claimedEvent({ id: "ko", attemptCount: 0 })];
    const useCase = new PublishPendingOutboxEventsUseCase(repository, new FakeDispatcher((event) => event.id === "ko"), new FixedClock());

    const result = await useCase.execute();

    expect(result).toEqual({ claimed: 2, published: 1, failed: 1, deadLettered: 0 });
    expect(repository.published).toEqual(["ok"]);
    expect(repository.failedAndRescheduled).toEqual([{ id: "ko", attemptCount: 1 }]);
  });
});
