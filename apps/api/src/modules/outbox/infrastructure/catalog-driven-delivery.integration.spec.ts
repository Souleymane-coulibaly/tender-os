import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { OutboxEventHandler } from "../application/ports/outbox-event-handler";
import { RecordEventProcessedByConsumerUseCase } from "../application/use-cases/record-event-processed-by-consumer.use-case";
import { OUTBOX_MAX_ATTEMPTS } from "../domain/outbox-event-status";
import { publishOutboxEventsByIds } from "../test-support/scoped-outbox-test-harness";
import { CompositeOutboxEventDispatcher } from "./composite-outbox-event-dispatcher";
import { PrismaProcessedEventRepository } from "./prisma-processed-event.repository";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E12.4 — FIX-3B : le runtime respecte la classification du catalogue.
 *
 * Tous les `eventType` utilisés ici sont de VRAIS types catalogués — jamais des fixtures
 * synthétiques : ce qui est sous test est précisément la dérivation depuis la SSoT de production.
 *  - `CommentAdded`, `KnowledgeEntryCreated`, `DceAnalysisStarted`… : AUDIT_ONLY, aucun handler.
 *  - `UserMentioned`, `TaskAssigned`, `ApprovalRequested` : INTERNAL, handler attendu.
 *
 * La règle que ces tests verrouillent : faire disparaître `NoOutboxHandlerRegisteredError` UNIQUEMENT
 * là où ce n'est pas une erreur. Un INTERNAL mal câblé doit continuer d'échouer bruyamment.
 */
const AUDIT_ONLY_TYPE = "CommentAdded";
const AUDIT_ONLY_TYPE_2 = "KnowledgeEntryCreated";
const INTERNAL_TYPE = "UserMentioned";
const INTERNAL_TYPE_2 = "TaskAssigned";
const UNCATALOGED_TYPE = "TotallyUncatalogedEventType";

describe("Outbox — livraison pilotée par le catalogue (FIX-3B) — PostgreSQL réel", () => {
  const prisma = new PrismaService();
  const recordProcessed = new RecordEventProcessedByConsumerUseCase(new PrismaProcessedEventRepository(prisma));
  const organizationId = randomUUID();

  /**
   * Checkpoint TENDEROS-2.1-P2.3-E12.4 (correctif post-FULL-RUN) — publie UNIQUEMENT les événements
   * de ce test, via `ScopedOutboxTestHarness` (FIX-2A).
   *
   * La version initiale de ce fichier appelait `PublishPendingOutboxEventsUseCase.execute()`, dont
   * le claim est GLOBAL : en isolement elle passait, mais dans la suite complète elle réclamait tout
   * le backlog des autres suites et mesurait `failed = 336` au lieu de 0. C'était exactement H7 —
   * pourtant confirmé expérimentalement — et `ScopedOutboxTestHarness` existait déjà pour cela.
   * Les compteurs assertés ci-dessous sont donc SCOPÉS, jamais globaux, et ce test ne pousse plus
   * aucun événement étranger vers FAILED/DEAD_LETTER.
   */
  function publishOwn(handlers: OutboxEventHandler[], eventIds: readonly string[]) {
    // Aucune politique injectée : c'est le CATALOGUE RÉEL qui décide, comme en production.
    const dispatcher = new CompositeOutboxEventDispatcher(handlers, recordProcessed);
    return publishOutboxEventsByIds({ prisma: prisma as unknown as import("@prisma/client").PrismaClient, dispatcher, eventIds });
  }

  /**
   * Checkpoint TENDEROS-2.1-P2.3-E12.4 — `available_at` est antidate de 5 secondes A DESSEIN.
   *
   * Le harness scope filtre `available_at <= now` ou `now` vient de l'horloge JAVASCRIPT, alors que
   * l'insertion utilise `now()` de POSTGRESQL. Le moindre ecart entre les deux rendait l'evenement
   * inelegible : le test observait `PENDING` la ou il attendait `FAILED`. Invisible isolement,
   * reproductible sous charge — d'ou cette marge, qui ne change aucune semantique testee.
   */
  async function seed(eventType: string, count = 1): Promise<string[]> {
    const ids = Array.from({ length: count }, () => randomUUID());
    await prisma.$executeRawUnsafe(
      `INSERT INTO outbox_events (id, organization_id, event_type, event_version, aggregate_type, aggregate_id, payload, occurred_at, status, attempt_count, available_at, created_at)
       VALUES ${ids.map((id) => `('${id}'::uuid, '${organizationId}'::uuid, '${eventType}', 1, 'FIX3B', '${randomUUID()}'::uuid, '{}'::jsonb, now(), 'PENDING', 0, now() - interval '5 seconds', now() - interval '5 seconds')`).join(",")}`,
    );
    return ids;
  }

  const rowOf = (id: string) => prisma.outboxEvent.findUniqueOrThrow({ where: { id }, select: { status: true, attemptCount: true, lastError: true } });

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: { id: organizationId, name: "FIX-3B Catalog Delivery", slug: `fix3b-catalog-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
  }, 60000);

  afterEach(async () => {
    await prisma.processedEvent.deleteMany({ where: { organizationId } });
    await prisma.deadLetterEvent.deleteMany({ where: { organizationId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId } });
  });

  afterAll(async () => {
    await prisma.processedEvent.deleteMany({ where: { organizationId } });
    await prisma.deadLetterEvent.deleteMany({ where: { organizationId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  }, 60000);

  it("BLOQUANT (§10) — AUDIT_ONLY sans handler : PUBLISHED en UN traitement, aucun retry, aucun compteur d'échec", async () => {
    const [id] = await seed(AUDIT_ONLY_TYPE);
    const result = await publishOwn([], [id!]);

    const row = await rowOf(id!);
    expect(row.status).toBe("PUBLISHED");
    // Le compteur ne doit PAS être incrémenté : ce n'est pas une tentative ratée.
    expect(row.attemptCount).toBe(0);
    expect(row.lastError).toBeNull();
    expect(result.failed).toBe(0);
    expect(result.deadLettered).toBe(0);
  }, 120000);

  it("BLOQUANT (§21) — AUDIT_ONLY n'atteint JAMAIS DEAD_LETTER : dix ticks successifs ne le réclament qu'une fois", async () => {
    const ids = await seed(AUDIT_ONLY_TYPE_2, 10);

    // Dix publications successives sur LES MÊMES ids : un AUDIT_ONLY deja PUBLISHED n'est plus
    // eligible, donc seule la premiere reclame reellement. Compter les reclamations SCOPEES est ce
    // qui prouve « 1 traitement par evenement » — un compteur global melangerait le backlog voisin.
    let totalClaims = 0;
    for (let i = 0; i < 10; i++) totalClaims += (await publishOwn([], ids)).claimed;

    const rows = await prisma.outboxEvent.findMany({ where: { id: { in: ids } }, select: { status: true, attemptCount: true } });
    expect(rows.every((r) => r.status === "PUBLISHED")).toBe(true);
    expect(rows.every((r) => r.attemptCount === 0)).toBe(true);
    expect(await prisma.deadLetterEvent.count({ where: { organizationId } })).toBe(0);
    // §22 — 10 événements, 10 réclamations au total : UNE par événement, contre 5 avant FIX-3B.
    expect(totalClaims).toBe(10);
  }, 180000);

  it("BLOQUANT (§9) — INTERNAL sans handler : la protection reste ENTIÈRE (FAILED, retry, puis DEAD_LETTER)", async () => {
    const [id] = await seed(INTERNAL_TYPE);

    await publishOwn([], [id!]);
    let row = await rowOf(id!);
    expect(row.status).toBe("FAILED");
    expect(row.attemptCount).toBe(1);
    expect(row.lastError).toContain("No outbox handler is registered");

    // Le backoff repousse `available_at` : on le ramène à maintenant pour épuiser les tentatives
    // sans attendre réellement, jamais en modifiant la politique de retry elle-même.
    for (let attempt = 2; attempt <= OUTBOX_MAX_ATTEMPTS; attempt++) {
      await prisma.$executeRawUnsafe(`UPDATE outbox_events SET available_at = now() - interval '1 second' WHERE id = '${id}'::uuid`);
      await publishOwn([], [id!]);
    }

    row = await rowOf(id!);
    expect(row.status).toBe("DEAD_LETTER");
    expect(row.attemptCount).toBe(OUTBOX_MAX_ATTEMPTS);
  }, 180000);

  it("BLOQUANT (§20) — une VRAIE exception de handler reste un échec : FIX-3B ne transforme aucune erreur en succès", async () => {
    const [id] = await seed(INTERNAL_TYPE);
    const throwing: OutboxEventHandler = { eventType: INTERNAL_TYPE, handle: async () => { throw new Error("transient downstream failure"); } };

    await publishOwn([throwing], [id!]);

    const row = await rowOf(id!);
    expect(row.status).toBe("FAILED");
    expect(row.attemptCount).toBe(1);
    expect(row.lastError).toContain("transient downstream failure");
  }, 120000);

  it("BLOQUANT (§18) — un eventType NON catalogué n'est jamais un succès : erreur de gouvernance explicite", async () => {
    const [id] = await seed(UNCATALOGED_TYPE);

    await publishOwn([], [id!]);

    const row = await rowOf(id!);
    expect(row.status).toBe("FAILED");
    expect(row.lastError).toContain("not declared in OUTBOX_EVENT_CATALOG");
  }, 120000);

  it("BLOQUANT (§19) — contradiction catalogue/handler : un handler inattendu sur un AUDIT_ONLY n'est jamais exécuté silencieusement", async () => {
    const [id] = await seed(AUDIT_ONLY_TYPE);
    let executed = false;
    const unexpected: OutboxEventHandler = { eventType: AUDIT_ONLY_TYPE, handle: async () => { executed = true; } };

    await publishOwn([unexpected], [id!]);

    const row = await rowOf(id!);
    expect(executed).toBe(false);
    expect(row.status).toBe("FAILED");
    expect(row.lastError).toContain("cataloged as requiring no internal delivery");
  }, 120000);

  it("BLOQUANT (§31) — LOT MIXTE : 50 AUDIT_ONLY + 10 INTERNAL traités + 5 INTERNAL sans handler, chacun selon SA classification", async () => {
    const auditIds = await seed(AUDIT_ONLY_TYPE, 50);
    const handledIds = await seed(INTERNAL_TYPE, 10);
    const unhandledIds = await seed(INTERNAL_TYPE_2, 5);

    let sideEffects = 0;
    const handler: OutboxEventHandler = { eventType: INTERNAL_TYPE, handle: async () => { sideEffects += 1; } };
    const result = await publishOwn([handler], [...auditIds, ...handledIds, ...unhandledIds]);

    const statusesOf = async (ids: string[]) =>
      (await prisma.outboxEvent.findMany({ where: { id: { in: ids } }, select: { status: true } })).map((r) => r.status);

    expect(await statusesOf(auditIds)).toEqual(Array(50).fill("PUBLISHED"));
    expect(await statusesOf(handledIds)).toEqual(Array(10).fill("PUBLISHED"));
    expect(await statusesOf(unhandledIds)).toEqual(Array(5).fill("FAILED"));

    // Les effets de bord réels n'ont eu lieu QUE pour les INTERNAL réellement handlés.
    expect(sideEffects).toBe(10);
    // Aucune classification n'a influencé le traitement d'une autre.
    expect(result.published).toBe(60);
    expect(result.failed).toBe(5);
    expect(result.deadLettered).toBe(0);
  }, 300000);
});
