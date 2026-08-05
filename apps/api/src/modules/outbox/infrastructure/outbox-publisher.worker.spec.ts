import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublishPendingOutboxEventsResult } from "../application/use-cases/publish-pending-outbox-events.use-case";
import { OutboxPublisherWorker } from "./outbox-publisher.worker";

const EMPTY_RESULT: PublishPendingOutboxEventsResult = { claimed: 0, published: 0, failed: 0, deadLettered: 0 };

function fakeUseCase(execute: (input?: { batchSize?: number }) => Promise<PublishPendingOutboxEventsResult>) {
  return { execute } as unknown as import("../application/use-cases/publish-pending-outbox-events.use-case").PublishPendingOutboxEventsUseCase;
}

describe("OutboxPublisherWorker", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  it("mission Sprint 1 correctif audit Codex P1-001 — starts a real timer on init and ticks the use case periodically", async () => {
    process.env.OUTBOX_POLL_INTERVAL_MS = "1000";
    const execute = vi.fn(async () => EMPTY_RESULT);
    const worker = new OutboxPublisherWorker(fakeUseCase(execute));

    worker.onModuleInit();
    expect(execute).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(execute).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(execute).toHaveBeenCalledTimes(2);

    worker.onModuleDestroy();
  });

  it("stops ticking once destroyed — no further calls after OnModuleDestroy", async () => {
    process.env.OUTBOX_POLL_INTERVAL_MS = "1000";
    const execute = vi.fn(async () => EMPTY_RESULT);
    const worker = new OutboxPublisherWorker(fakeUseCase(execute));

    worker.onModuleInit();
    await vi.advanceTimersByTimeAsync(1000);
    expect(execute).toHaveBeenCalledTimes(1);

    worker.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(5000);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("never starts a timer when OUTBOX_WORKER_ENABLED=false", async () => {
    process.env.OUTBOX_WORKER_ENABLED = "false";
    const execute = vi.fn(async () => EMPTY_RESULT);
    const worker = new OutboxPublisherWorker(fakeUseCase(execute));

    worker.onModuleInit();
    await vi.advanceTimersByTimeAsync(10000);

    expect(execute).not.toHaveBeenCalled();
    worker.onModuleDestroy();
  });

  it("never lets an in-flight tick overlap with the next one (no concurrent claims)", async () => {
    // Timers réels ici : le garde-fou testé (this.ticking) dépend d'une vraie latence
    // asynchrone entre le début et la fin d'un tick, pas d'une avance d'horloge simulée.
    vi.useRealTimers();
    let concurrentCalls = 0;
    let maxConcurrent = 0;
    const execute = vi.fn(async () => {
      concurrentCalls += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
      await new Promise((resolve) => setTimeout(resolve, 30));
      concurrentCalls -= 1;
      return EMPTY_RESULT;
    });
    const worker = new OutboxPublisherWorker(fakeUseCase(execute));

    const first = worker.tick();
    const second = worker.tick();
    await Promise.all([first, second]);

    expect(maxConcurrent).toBe(1);
    // Le second appel arrive pendant que le premier tourne encore : il doit être un no-op.
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("logs the failure and keeps running instead of crashing when the use case throws", async () => {
    const execute = vi.fn(async () => { throw new Error("boom"); });
    const worker = new OutboxPublisherWorker(fakeUseCase(execute));

    await expect(worker.tick()).resolves.toBeUndefined();
  });
});
