import { describe, expect, it } from "vitest";
import { NoOutboxHandlerRegisteredError } from "../domain/errors";
import type { OutboxEventHandler } from "../application/ports/outbox-event-handler";
import type { OutboxEventToDispatch } from "../application/ports/outbox-event-dispatcher";
import { CompositeOutboxEventDispatcher } from "./composite-outbox-event-dispatcher";

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

describe("CompositeOutboxEventDispatcher", () => {
  it("routes an event to the handler registered for its eventType", async () => {
    const received: OutboxEventToDispatch[] = [];
    const handler: OutboxEventHandler = { eventType: "TEST_EVENT", handle: async (e) => { received.push(e); } };
    const dispatcher = new CompositeOutboxEventDispatcher([handler]);

    await dispatcher.dispatch(event());

    expect(received).toHaveLength(1);
  });

  it("mission Sprint 1 correctif audit Codex P1-002 — never silently succeeds for an unregistered eventType", async () => {
    const dispatcher = new CompositeOutboxEventDispatcher([]);

    await expect(dispatcher.dispatch(event({ eventType: "NEVER_REGISTERED" }))).rejects.toThrow(NoOutboxHandlerRegisteredError);
  });

  it("dispatches to the correct handler among several registered", async () => {
    const calls: string[] = [];
    const dispatcher = new CompositeOutboxEventDispatcher([
      { eventType: "A", handle: async () => { calls.push("A"); } },
      { eventType: "B", handle: async () => { calls.push("B"); } },
    ]);

    await dispatcher.dispatch(event({ eventType: "B" }));

    expect(calls).toEqual(["B"]);
  });

  it("works with no handlers registered at all (default Sprint 1 wiring)", () => {
    expect(() => new CompositeOutboxEventDispatcher()).not.toThrow();
  });
});
