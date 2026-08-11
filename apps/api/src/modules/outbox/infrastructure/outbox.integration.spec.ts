import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { OutboxEventHandler } from "../application/ports/outbox-event-handler";
import { PublishPendingOutboxEventsUseCase } from "../application/use-cases/publish-pending-outbox-events.use-case";
import { OutboxEventStatus } from "../domain/outbox-event-status";
import { CompositeOutboxEventDispatcher } from "./composite-outbox-event-dispatcher";
import { OutboxPublisherWorker } from "./outbox-publisher.worker";
import { PrismaOutboxEventRepository } from "./prisma-outbox-event.repository";
import { PrismaProcessedEventRepository } from "./prisma-processed-event.repository";

class SystemClock {
  now(): Date {
    return new Date();
  }
}

/**
 * Preuve PostgreSQL réelle (même motif que les autres suites `*.integration.spec.ts` du repo) :
 * un fake en mémoire ne peut pas démontrer `FOR UPDATE SKIP LOCKED`, l'atomicité transactionnelle
 * réelle (DATABASE_PATTERNS.md §122), ni les CHECK constraints hand-appended.
 */
/** `claimPendingBatch` est volontairement GLOBAL (non scopé par organizationId — un worker réel
 *  doit traiter tous les tenants). Ce fichier tourne désormais concurremment à
 *  `outbox-worker.integration.spec.ts` (autre fichier `*.integration.spec.ts` manipulant le même
 *  claim global) : chaque assertion doit donc filtrer sur les événements réellement créés par ce
 *  test, jamais supposer une exclusivité totale du claim. */
function mine<T extends { organizationId: string }>(claimed: T[], organizationId: string): T[] {
  return claimed.filter((e) => e.organizationId === organizationId);
}

describe("Outbox repositories (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const outboxRepository = new PrismaOutboxEventRepository(prisma);
  const processedEventRepository = new PrismaProcessedEventRepository(prisma);

  const organizationId = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: { id: organizationId, name: "Outbox Repo Test Org", slug: `outbox-repo-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
  });

  afterAll(async () => {
    await prisma.deadLetterEvent.deleteMany({ where: { organizationId } });
    await prisma.processedEvent.deleteMany({ where: { organizationId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.deadLetterEvent.deleteMany({ where: { organizationId } });
    await prisma.processedEvent.deleteMany({ where: { organizationId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId } });
  });

  it("mission §2 (DATABASE_PATTERNS.md §122) — a rolled back business transaction leaves no outbox event", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await outboxRepository.insertMany(
          { organizationId, events: [{ eventType: "TEST_EVENT", aggregateType: "Test", aggregateId: randomUUID(), payload: {}, occurredAt: new Date() }] },
          tx,
        );
        throw new Error("business rule violated after the outbox insert");
      }),
    ).rejects.toThrow("business rule violated");

    const count = await prisma.outboxEvent.count({ where: { organizationId } });
    expect(count).toBe(0);
  });

  it("writes an outbox event atomically within an already-open business transaction", async () => {
    const aggregateId = randomUUID();
    await prisma.$transaction(async (tx) => {
      await outboxRepository.insertMany(
        { organizationId, events: [{ eventType: "TEST_EVENT", aggregateType: "Test", aggregateId, payload: { hello: "world" }, occurredAt: new Date() }] },
        tx,
      );
    });

    const stored = await prisma.outboxEvent.findFirst({ where: { organizationId, aggregateId } });
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe(OutboxEventStatus.Pending);
  });

  it("claims pending events, marks them PROCESSING, and does not return them again to a second claim", async () => {
    await outboxRepository.insertMany({ organizationId, events: [{ eventType: "TEST_EVENT", aggregateType: "Test", aggregateId: randomUUID(), payload: {}, occurredAt: new Date() }] });

    const firstClaim = mine(await outboxRepository.claimPendingBatch({ limit: 50, now: new Date(), staleProcessingThresholdMs: 5 * 60 * 1000 }), organizationId);
    expect(firstClaim).toHaveLength(1);
    const [claimed] = firstClaim;
    if (!claimed) throw new Error("expected one claimed event");

    const secondClaim = mine(await outboxRepository.claimPendingBatch({ limit: 50, now: new Date(), staleProcessingThresholdMs: 5 * 60 * 1000 }), organizationId);
    expect(secondClaim).toHaveLength(0);

    const stored = await prisma.outboxEvent.findUnique({ where: { id: claimed.id } });
    expect(stored?.status).toBe(OutboxEventStatus.Processing);
  });

  it("does not claim a failed event before its rescheduled availableAt", async () => {
    await outboxRepository.insertMany({ organizationId, events: [{ eventType: "TEST_EVENT", aggregateType: "Test", aggregateId: randomUUID(), payload: {}, occurredAt: new Date() }] });
    const [claimed] = mine(await outboxRepository.claimPendingBatch({ limit: 50, now: new Date(), staleProcessingThresholdMs: 5 * 60 * 1000 }), organizationId);
    if (!claimed) throw new Error("expected one claimed event");

    const farFuture = new Date(Date.now() + 60 * 60 * 1000);
    await outboxRepository.markFailedAndReschedule({ id: claimed.id, organizationId, error: "boom", nextAvailableAt: farFuture, attemptCount: 1 });

    const tooEarly = mine(await outboxRepository.claimPendingBatch({ limit: 50, now: new Date(), staleProcessingThresholdMs: 5 * 60 * 1000 }), organizationId);
    expect(tooEarly).toHaveLength(0);

    const afterBackoff = mine(await outboxRepository.claimPendingBatch({ limit: 50, now: new Date(farFuture.getTime() + 1000), staleProcessingThresholdMs: 5 * 60 * 1000 }), organizationId);
    expect(afterBackoff).toHaveLength(1);
  });

  it("audit Codex OUTBOX-P1-02 — a PROCESSING event whose lease expired (worker crashed before publish/fail) is reclaimed, never stuck forever", async () => {
    const aggregateId = randomUUID();
    await outboxRepository.insertMany({ organizationId, events: [{ eventType: "TEST_EVENT", aggregateType: "Test", aggregateId, payload: {}, occurredAt: new Date() }] });

    const claimedAt = new Date();
    const [claimed] = mine(await outboxRepository.claimPendingBatch({ limit: 50, now: claimedAt, staleProcessingThresholdMs: 5 * 60 * 1000 }), organizationId);
    if (!claimed) throw new Error("expected one claimed event");

    const stillLeased = await prisma.outboxEvent.findUnique({ where: { id: claimed.id } });
    expect(stillLeased?.status).toBe(OutboxEventStatus.Processing);

    // Le worker "crashe" ici : jamais markPublished/markFailedAndReschedule/moveToDeadLetter
    // appelé. Avant que le bail n'expire, un autre worker ne doit JAMAIS reclaimer cette ligne.
    const withinLease = mine(
      await outboxRepository.claimPendingBatch({ limit: 50, now: new Date(claimedAt.getTime() + 60 * 1000), staleProcessingThresholdMs: 5 * 60 * 1000 }),
      organizationId,
    );
    expect(withinLease).toHaveLength(0);

    // Après expiration du bail (staleProcessingThresholdMs), un nouveau worker doit reclaimer la
    // ligne PROCESSING abandonnée — jamais bloquée indéfiniment.
    const afterLeaseExpiry = mine(
      await outboxRepository.claimPendingBatch({ limit: 50, now: new Date(claimedAt.getTime() + 6 * 60 * 1000), staleProcessingThresholdMs: 5 * 60 * 1000 }),
      organizationId,
    );
    expect(afterLeaseExpiry).toHaveLength(1);
    expect(afterLeaseExpiry[0]!.id).toBe(claimed.id);
    // attemptCount n'a pas été incrémenté par la reprise elle-même (seul un échec explicite via
    // markFailedAndReschedule l'incrémente) — la reprise n'est pas comptée comme une tentative
    // supplémentaire au-delà de ce que le worker qui la traite décidera lui-même.
    expect(afterLeaseExpiry[0]!.attemptCount).toBe(0);
  });

  it("moving an event to dead-letter creates a DeadLetterEvent row and sets the terminal status", async () => {
    const aggregateId = randomUUID();
    await outboxRepository.insertMany({ organizationId, events: [{ eventType: "TEST_EVENT", aggregateType: "Test", aggregateId, payload: { a: 1 }, occurredAt: new Date() }] });
    const [claimed] = mine(await outboxRepository.claimPendingBatch({ limit: 50, now: new Date(), staleProcessingThresholdMs: 5 * 60 * 1000 }), organizationId);
    if (!claimed) throw new Error("expected one claimed event");

    await outboxRepository.moveToDeadLetter({ id: claimed.id, organizationId, error: "definitive failure", attemptCount: 5 });

    const stored = await prisma.outboxEvent.findUnique({ where: { id: claimed.id } });
    expect(stored?.status).toBe(OutboxEventStatus.DeadLetter);

    const deadLetter = await prisma.deadLetterEvent.findUnique({ where: { outboxEventId: claimed.id } });
    expect(deadLetter).not.toBeNull();
    expect(deadLetter?.attemptCount).toBe(5);
    expect(deadLetter?.aggregateId).toBe(aggregateId);
  });

  it("rejects an out-of-catalogue status at the database level (CHECK constraint)", async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO outbox_events (id, organization_id, event_type, aggregate_type, aggregate_id, payload, occurred_at, status)
        VALUES (${randomUUID()}::uuid, ${organizationId}::uuid, 'X', 'X', ${randomUUID()}::uuid, '{}'::jsonb, now(), 'NOT_A_REAL_STATUS')`,
    ).rejects.toThrow();
  });

  it("processed-event ledger is idempotent: recording the same (event, consumer) pair twice never throws and never duplicates", async () => {
    await outboxRepository.insertMany({ organizationId, events: [{ eventType: "TEST_EVENT", aggregateType: "Test", aggregateId: randomUUID(), payload: {}, occurredAt: new Date() }] });
    const [claimed] = mine(await outboxRepository.claimPendingBatch({ limit: 50, now: new Date(), staleProcessingThresholdMs: 5 * 60 * 1000 }), organizationId);
    if (!claimed) throw new Error("expected one claimed event");

    await processedEventRepository.recordProcessed({ organizationId, outboxEventId: claimed.id, consumerName: "test-consumer" });
    await expect(processedEventRepository.recordProcessed({ organizationId, outboxEventId: claimed.id, consumerName: "test-consumer" })).resolves.not.toThrow();

    const count = await prisma.processedEvent.count({ where: { outboxEventId: claimed.id, consumerName: "test-consumer" } });
    expect(count).toBe(1);
    expect(await processedEventRepository.wasProcessedBy({ outboxEventId: claimed.id, consumerName: "test-consumer" })).toBe(true);
    expect(await processedEventRepository.wasProcessedBy({ outboxEventId: claimed.id, consumerName: "another-consumer" })).toBe(false);
  });

  // Correctif audit Codex P1-001/P1-002 — regroupé dans ce même fichier (et non un fichier
  // `*.integration.spec.ts` séparé) délibérément : Vitest exécute les `it` d'un même fichier
  // séquentiellement, ce qui élimine toute course avec les tests `claimPendingBatch` ci-dessus sur
  // la même table globale `outbox_events` — deux fichiers distincts manipulant ce claim global en
  // parallèle se sont avérés instables en pratique (constaté lors de ce correctif).
  describe("OutboxPublisherWorker (PostgreSQL réel)", () => {
    it("drains a backlog that already existed before the worker's first tick", async () => {
      await outboxRepository.insertMany({
        organizationId,
        events: Array.from({ length: 5 }, (_, i) => ({ eventType: "TEST_EVENT", aggregateType: "Test", aggregateId: randomUUID(), payload: { i }, occurredAt: new Date() })),
      });

      const handled: string[] = [];
      const handler: OutboxEventHandler = { eventType: "TEST_EVENT", handle: async (event) => { handled.push(event.id); } };
      const dispatcher = new CompositeOutboxEventDispatcher([handler]);
      const useCase = new PublishPendingOutboxEventsUseCase(outboxRepository, dispatcher, new SystemClock());
      const worker = new OutboxPublisherWorker(useCase);

      await worker.tick();

      expect(handled).toHaveLength(5);
      const published = await prisma.outboxEvent.count({ where: { organizationId, status: OutboxEventStatus.Published } });
      expect(published).toBe(5);
    });

    it("resumes an untouched backlog after being stopped and a fresh worker instance is created (restart)", async () => {
      await outboxRepository.insertMany({
        organizationId,
        events: [{ eventType: "TEST_EVENT", aggregateType: "Test", aggregateId: randomUUID(), payload: {}, occurredAt: new Date() }],
      });

      const dispatcher = new CompositeOutboxEventDispatcher([{ eventType: "TEST_EVENT", handle: async () => {} }]);
      const firstWorker = new OutboxPublisherWorker(new PublishPendingOutboxEventsUseCase(outboxRepository, dispatcher, new SystemClock()));
      firstWorker.onModuleInit();
      firstWorker.onModuleDestroy();

      let stillPending = await prisma.outboxEvent.count({ where: { organizationId, status: OutboxEventStatus.Pending } });
      expect(stillPending).toBe(1);

      const secondWorker = new OutboxPublisherWorker(new PublishPendingOutboxEventsUseCase(outboxRepository, dispatcher, new SystemClock()));
      await secondWorker.tick();

      stillPending = await prisma.outboxEvent.count({ where: { organizationId, status: OutboxEventStatus.Pending } });
      const published = await prisma.outboxEvent.count({ where: { organizationId, status: OutboxEventStatus.Published } });
      expect(stillPending).toBe(0);
      expect(published).toBe(1);
    });

    it("an event with no registered handler is never marked PUBLISHED (correctif P1-002)", async () => {
      await outboxRepository.insertMany({
        organizationId,
        events: [{ eventType: "TYPE_WITHOUT_HANDLER", aggregateType: "Test", aggregateId: randomUUID(), payload: {}, occurredAt: new Date() }],
      });

      const dispatcher = new CompositeOutboxEventDispatcher([]);
      const worker = new OutboxPublisherWorker(new PublishPendingOutboxEventsUseCase(outboxRepository, dispatcher, new SystemClock()));

      await worker.tick();

      const published = await prisma.outboxEvent.count({ where: { organizationId, status: OutboxEventStatus.Published } });
      const failed = await prisma.outboxEvent.count({ where: { organizationId, status: OutboxEventStatus.Failed } });
      expect(published).toBe(0);
      expect(failed).toBe(1);
    });
  });
});
