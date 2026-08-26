import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { OutboxEventHandler } from "../application/ports/outbox-event-handler";
import { RecordEventProcessedByConsumerUseCase } from "../application/use-cases/record-event-processed-by-consumer.use-case";
import { OutboxEventStatus } from "../domain/outbox-event-status";
import { CompositeOutboxEventDispatcher } from "../infrastructure/composite-outbox-event-dispatcher";
import { PrismaOutboxEventRepository } from "../infrastructure/prisma-outbox-event.repository";
import { PrismaProcessedEventRepository } from "../infrastructure/prisma-processed-event.repository";
import { publishOutboxEventsByIds } from "./scoped-outbox-test-harness";
import type { OutboxEventDeliveryPolicy } from "../application/ports/outbox-event-delivery-policy";

/** Checkpoint TENDEROS-2.1-P2.3-E12.4 — FIX-3B : ce fichier declare des eventType SYNTHETIQUES,
 *  volontairement absents du catalogue produit. Il declare donc lui-meme leur classification :
 *  livraison interne requise, ce qui reproduit exactement le comportement historique teste ici
 *  (aucun handler => NoOutboxHandlerRegisteredError => FAILED/retry). */
const SYNTHETIC_INTERNAL_DELIVERY_POLICY: OutboxEventDeliveryPolicy = { requiresInternalDelivery: () => true };

describe("Scoped outbox test harness (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const outboxRepository = new PrismaOutboxEventRepository(prisma);
  const processedEventRepository = new PrismaProcessedEventRepository(prisma);
  const recordProcessed = new RecordEventProcessedByConsumerUseCase(processedEventRepository);
  const organizationId = randomUUID();

  const handledEventIds: string[] = [];
  const handledEventTypes: string[] = [];
  const ownHandler: OutboxEventHandler = {
    eventType: "OWN_EVENT",
    handle: async (event) => {
      handledEventIds.push(event.id);
      handledEventTypes.push(event.eventType);
    },
  };
  const foreignHandler: OutboxEventHandler = {
    eventType: "FOREIGN_EVENT",
    handle: async (event) => {
      handledEventIds.push(event.id);
      handledEventTypes.push(event.eventType);
    },
  };
  const dispatcher = new CompositeOutboxEventDispatcher([ownHandler, foreignHandler], recordProcessed, SYNTHETIC_INTERNAL_DELIVERY_POLICY);

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Scoped Outbox Harness Org",
        slug: `scoped-outbox-harness-${organizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
  });

  beforeEach(async () => {
    handledEventIds.length = 0;
    handledEventTypes.length = 0;
    await prisma.deadLetterEvent.deleteMany({ where: { organizationId } });
    await prisma.processedEvent.deleteMany({ where: { organizationId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId } });
  });

  afterAll(async () => {
    await prisma.deadLetterEvent.deleteMany({ where: { organizationId } });
    await prisma.processedEvent.deleteMany({ where: { organizationId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  async function insertEvent(input: { eventType: string; aggregateId?: string }) {
    const aggregateId = input.aggregateId ?? randomUUID();
    await outboxRepository.insertMany({
      organizationId,
      events: [{ eventType: input.eventType, aggregateType: "Test", aggregateId, payload: {}, occurredAt: new Date() }],
    });
    const event = await prisma.outboxEvent.findFirst({ where: { organizationId, eventType: input.eventType, aggregateId }, orderBy: { createdAt: "desc" } });
    if (!event) throw new Error(`Outbox event ${input.eventType} not found`);
    return event;
  }

  it("publishes OWN_EVENT by id without touching 100 FOREIGN_EVENT rows", async () => {
    for (let i = 0; i < 100; i += 1) {
      await insertEvent({ eventType: "FOREIGN_EVENT" });
    }
    const own = await insertEvent({ eventType: "OWN_EVENT" });

    const result = await publishOutboxEventsByIds({ prisma, dispatcher, eventIds: [own.id] });

    expect(result.claimed).toBe(1);
    expect(handledEventIds).toEqual([own.id]);
    const ownStored = await prisma.outboxEvent.findUnique({ where: { id: own.id } });
    expect(ownStored?.status).toBe(OutboxEventStatus.Published);
    const foreignStatuses = await prisma.outboxEvent.findMany({ where: { organizationId, eventType: "FOREIGN_EVENT" }, select: { status: true } });
    expect(foreignStatuses).toHaveLength(100);
    expect(foreignStatuses.every((row) => row.status === OutboxEventStatus.Pending)).toBe(true);
  });

  it("does not consume foreign events without handler when only OWN_EVENT ids are requested", async () => {
    const foreign = await insertEvent({ eventType: "NO_HANDLER_FOREIGN_EVENT" });
    const own = await insertEvent({ eventType: "OWN_EVENT" });

    await publishOutboxEventsByIds({ prisma, dispatcher, eventIds: [own.id] });

    const foreignStored = await prisma.outboxEvent.findUnique({ where: { id: foreign.id } });
    const ownStored = await prisma.outboxEvent.findUnique({ where: { id: own.id } });
    expect(foreignStored?.status).toBe(OutboxEventStatus.Pending);
    expect(ownStored?.status).toBe(OutboxEventStatus.Published);
  });

  it("does not consume eligible expired PROCESSING foreign events when their ids are not requested", async () => {
    const foreign = await insertEvent({ eventType: "FOREIGN_EVENT" });
    const own = await insertEvent({ eventType: "OWN_EVENT" });
    await prisma.outboxEvent.update({
      where: { id: foreign.id },
      data: { status: OutboxEventStatus.Processing, availableAt: new Date(Date.now() - 60_000) },
    });

    await publishOutboxEventsByIds({ prisma, dispatcher, eventIds: [own.id] });

    const foreignStored = await prisma.outboxEvent.findUnique({ where: { id: foreign.id } });
    const ownStored = await prisma.outboxEvent.findUnique({ where: { id: own.id } });
    expect(foreignStored?.status).toBe(OutboxEventStatus.Processing);
    expect(ownStored?.status).toBe(OutboxEventStatus.Published);
  });

  it("isolates scenario A from scenario B, then drains B separately", async () => {
    const eventA = await insertEvent({ eventType: "OWN_EVENT", aggregateId: randomUUID() });
    const eventB = await insertEvent({ eventType: "OWN_EVENT", aggregateId: randomUUID() });

    await publishOutboxEventsByIds({ prisma, dispatcher, eventIds: [eventA.id] });

    expect((await prisma.outboxEvent.findUnique({ where: { id: eventA.id } }))?.status).toBe(OutboxEventStatus.Published);
    expect((await prisma.outboxEvent.findUnique({ where: { id: eventB.id } }))?.status).toBe(OutboxEventStatus.Pending);

    await publishOutboxEventsByIds({ prisma, dispatcher, eventIds: [eventB.id] });

    expect((await prisma.outboxEvent.findUnique({ where: { id: eventB.id } }))?.status).toBe(OutboxEventStatus.Published);
  });

  it("two concurrent scoped drains on disjoint ids do not cross-treat events", async () => {
    const eventA = await insertEvent({ eventType: "OWN_EVENT", aggregateId: randomUUID() });
    const eventB = await insertEvent({ eventType: "FOREIGN_EVENT", aggregateId: randomUUID() });

    const [resultA, resultB] = await Promise.all([
      publishOutboxEventsByIds({ prisma, dispatcher, eventIds: [eventA.id] }),
      publishOutboxEventsByIds({ prisma, dispatcher, eventIds: [eventB.id] }),
    ]);

    expect(resultA.claimed).toBe(1);
    expect(resultB.claimed).toBe(1);
    expect(new Set(handledEventIds)).toEqual(new Set([eventA.id, eventB.id]));
    expect((await prisma.outboxEvent.findUnique({ where: { id: eventA.id } }))?.status).toBe(OutboxEventStatus.Published);
    expect((await prisma.outboxEvent.findUnique({ where: { id: eventB.id } }))?.status).toBe(OutboxEventStatus.Published);
  });
});
