import { describe, expect, it } from "vitest";
import { NoOutboxHandlerRegisteredError } from "../domain/errors";
import type { OutboxEventHandler } from "../application/ports/outbox-event-handler";
import type { OutboxEventToDispatch } from "../application/ports/outbox-event-dispatcher";
import type { ProcessedEventRepository } from "../application/ports/processed-event.repository";
import { RecordEventProcessedByConsumerUseCase } from "../application/use-cases/record-event-processed-by-consumer.use-case";
import { CompositeOutboxEventDispatcher } from "./composite-outbox-event-dispatcher";

class InMemoryProcessedEventRepository implements ProcessedEventRepository {
  private readonly processed = new Set<string>();

  async recordProcessed(input: { outboxEventId: string; consumerName: string }): Promise<void> {
    this.processed.add(`${input.outboxEventId}::${input.consumerName}`);
  }

  async wasProcessedBy(input: { outboxEventId: string; consumerName: string }): Promise<boolean> {
    return this.processed.has(`${input.outboxEventId}::${input.consumerName}`);
  }
}

function event(overrides: Partial<OutboxEventToDispatch> = {}): OutboxEventToDispatch {
  return {
    id: "event-1",
    organizationId: "org-1",
    eventType: "TEST_EVENT",
    eventVersion: 1,
    aggregateType: "Test",
    aggregateId: "agg-1",
    payload: {},
    occurredAt: new Date(),
    correlationId: null,
    ...overrides,
  };
}

function buildDispatcher(handlers: OutboxEventHandler[]): { dispatcher: CompositeOutboxEventDispatcher; processedEventRepository: InMemoryProcessedEventRepository } {
  const processedEventRepository = new InMemoryProcessedEventRepository();
  const dispatcher = new CompositeOutboxEventDispatcher(handlers, new RecordEventProcessedByConsumerUseCase(processedEventRepository));
  return { dispatcher, processedEventRepository };
}

describe("CompositeOutboxEventDispatcher", () => {
  it("routes an event to the handler registered for its eventType", async () => {
    const received: OutboxEventToDispatch[] = [];
    const handler: OutboxEventHandler = { eventType: "TEST_EVENT", handle: async (e) => { received.push(e); } };
    const { dispatcher } = buildDispatcher([handler]);

    await dispatcher.dispatch(event());

    expect(received).toHaveLength(1);
  });

  it("mission Sprint 1 correctif audit Codex P1-002 — never silently succeeds for an unregistered eventType", async () => {
    const { dispatcher } = buildDispatcher([]);

    await expect(dispatcher.dispatch(event({ eventType: "NEVER_REGISTERED" }))).rejects.toThrow(NoOutboxHandlerRegisteredError);
  });

  it("dispatches to the correct handler among several registered", async () => {
    const calls: string[] = [];
    const { dispatcher } = buildDispatcher([
      { eventType: "A", handle: async () => { calls.push("A"); } },
      { eventType: "B", handle: async () => { calls.push("B"); } },
    ]);

    await dispatcher.dispatch(event({ eventType: "B" }));

    expect(calls).toEqual(["B"]);
  });

  it("works with no handlers registered at all (default Sprint 1 wiring)", () => {
    const processedEventRepository = new InMemoryProcessedEventRepository();
    expect(() => new CompositeOutboxEventDispatcher([], new RecordEventProcessedByConsumerUseCase(processedEventRepository))).not.toThrow();
  });

  describe("Sprint 21 (hardening) — idempotent consumer, never a duplicate side effect on redelivery", () => {
    it("BLOQUANT — a redelivered event (same id, same eventType) never re-executes the handler's side effect", async () => {
      let callCount = 0;
      const handler: OutboxEventHandler = { eventType: "TEST_EVENT", handle: async () => { callCount += 1; } };
      const { dispatcher } = buildDispatcher([handler]);

      await dispatcher.dispatch(event());
      await dispatcher.dispatch(event()); // redelivery — same id/eventType

      expect(callCount).toBe(1);
    });

    it("never marks an event processed if the handler throws — a genuine failure must remain retryable", async () => {
      let callCount = 0;
      const handler: OutboxEventHandler = {
        eventType: "TEST_EVENT",
        handle: async () => {
          callCount += 1;
          if (callCount === 1) throw new Error("transient failure");
        },
      };
      const { dispatcher, processedEventRepository } = buildDispatcher([handler]);

      await expect(dispatcher.dispatch(event())).rejects.toThrow("transient failure");
      expect(await processedEventRepository.wasProcessedBy({ outboxEventId: "event-1", consumerName: "TEST_EVENT" })).toBe(false);

      await dispatcher.dispatch(event()); // retry succeeds
      expect(callCount).toBe(2);
      expect(await processedEventRepository.wasProcessedBy({ outboxEventId: "event-1", consumerName: "TEST_EVENT" })).toBe(true);
    });

    it("never conflates two DIFFERENT event ids sharing the same eventType — both are processed", async () => {
      let callCount = 0;
      const handler: OutboxEventHandler = { eventType: "TEST_EVENT", handle: async () => { callCount += 1; } };
      const { dispatcher } = buildDispatcher([handler]);

      await dispatcher.dispatch(event({ id: "event-1" }));
      await dispatcher.dispatch(event({ id: "event-2" }));

      expect(callCount).toBe(2);
    });
  });
});
