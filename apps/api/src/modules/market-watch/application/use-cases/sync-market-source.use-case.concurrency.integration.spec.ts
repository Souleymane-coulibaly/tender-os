import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import type { MarketSourceConnector, MarketSourceSearchResult } from "../ports/market-source-connector";
import { SyncMarketSourceUseCase } from "./sync-market-source.use-case";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E3, mission §46/§50/§57 — TEST H3 (deux exécutions concurrentes,
 * effets uniques) et TEST H4 (cycles répétés sur un AO déjà détecté, aucune re-notification).
 * Contrairement à `market-watch-http.integration.spec.ts` (qui exerce `MarketSourceSyncWorker.tick()`
 * en conditions normales, protégé par `MarketSourceSyncLeaseRepository.tryClaim`), ce fichier
 * appelle `SyncMarketSourceUseCase.execute()` directement en CONTOURNANT le bail — preuve de défense
 * en profondeur au niveau DB (`SavedSearchMatch.createIfNotExists`, `createMany({skipDuplicates})`),
 * jamais une simple confiance dans le bail seul.
 *
 * Connecteur factice (jamais BOAMP/TED réels) — un vrai réseau introduirait un non-déterminisme
 * incompatible avec la preuve exacte recherchée ici (mission §0 : ne jamais dupliquer les
 * connecteurs réels, ici on ne fait qu'implémenter le port pour un besoin de test).
 */
class FixedFakeConnector implements MarketSourceConnector {
  readonly source = "BOAMP";
  readonly marketType = "PUBLIC";
  constructor(private result: MarketSourceSearchResult) {}
  setResult(result: MarketSourceSearchResult): void {
    this.result = result;
  }
  async search(): Promise<MarketSourceSearchResult> {
    return this.result;
  }
}

describe("SyncMarketSourceUseCase — concurrency & re-notification (PostgreSQL réel)", () => {
  let prisma: PrismaService;
  let useCase: SyncMarketSourceUseCase;
  const organizationId = randomUUID();
  const ownerUserId = randomUUID();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    useCase = moduleRef.get(SyncMarketSourceUseCase);

    await prisma.organization.create({ data: { id: organizationId, name: "Sync Concurrency Org", slug: `sync-concurrency-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    await prisma.user.create({ data: { id: ownerUserId, email: `sync-concurrency-owner-${organizationId}@smoke.test`, displayName: "Sync Concurrency Owner", status: "ACTIVE", passwordHash: "unused" } });
  }, 30000);

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { organizationId } });
    await prisma.savedSearchMatch.deleteMany({ where: { organizationId } });
    await prisma.savedSearch.deleteMany({ where: { organizationId } });
    await prisma.externalTender.deleteMany({ where: { organizationId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId } });
    await prisma.user.delete({ where: { id: ownerUserId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  }, 30000);

  it("BLOQUANT — TEST H4: a second and third sync cycle over the SAME still-matching opportunity (even as it is updated by the source) never re-notifies (exactly 1 detection over 3 cycles)", async () => {
    const savedSearch = await prisma.savedSearch.create({
      data: {
        id: randomUUID(),
        organizationId,
        ownerUserId,
        name: "Veille H4",
        includeKeywords: ["nettoyage"],
        excludeKeywords: [],
        cpvCodes: [],
        countries: [],
        regions: [],
        departments: [],
        cities: [],
        marketTypes: [],
        sources: [],
        includeUnknownAmount: true,
        procedureTypes: [],
        alertInApp: true,
        createdBy: ownerUserId,
      },
    });
    const externalId = `h4-${randomUUID()}`;
    const connector = new FixedFakeConnector({ items: [{ externalId, title: "Marché de nettoyage industriel H4", cpvCodes: [], submissionDeadline: new Date("2026-09-01T00:00:00.000Z") }], nextCursor: null });

    const h0 = await useCase.execute({ organizationId, connector }); // detected
    expect(h0.created).toBe(1);

    // Mission §20 — un rectificatif (ex. report de date limite) touche l'ExternalTender (outcome
    // "updated", donc réévalué par le matching) sans jamais être traité comme une NOUVELLE
    // opportunité : c'est exactement ce cas réel que H1/H2 exercent ci-dessous, pas un simple
    // re-fetch identique (qui, lui, ne ré-entre même pas dans la phase de matching — voir le
    // commentaire de classe sur `execute()`, "uniquement sur le DELTA").
    connector.setResult({ items: [{ externalId, title: "Marché de nettoyage industriel H4", cpvCodes: [], submissionDeadline: new Date("2026-09-15T00:00:00.000Z") }], nextCursor: null });
    const h1 = await useCase.execute({ organizationId, connector }); // updated, still matches
    expect(h1.updated).toBe(1);

    connector.setResult({ items: [{ externalId, title: "Marché de nettoyage industriel H4", cpvCodes: [], submissionDeadline: new Date("2026-10-01T00:00:00.000Z") }], nextCursor: null });
    const h2 = await useCase.execute({ organizationId, connector }); // updated again, still matches
    expect(h2.updated).toBe(1);

    expect(h0.matchesCreated).toBe(1);
    expect(h0.notificationsCreated).toBe(1);
    expect(h1.matchesCreated).toBe(0);
    expect(h1.notificationsCreated).toBe(0);
    expect(h2.matchesCreated).toBe(0);
    expect(h2.notificationsCreated).toBe(0);

    const matches = await prisma.savedSearchMatch.findMany({ where: { organizationId, savedSearchId: savedSearch.id } });
    expect(matches).toHaveLength(1);
    const notifications = await prisma.notification.findMany({ where: { organizationId, userId: ownerUserId, type: "SAVED_SEARCH_MATCH" } });
    expect(notifications).toHaveLength(1);
  }, 30000);

  it("BLOQUANT — TEST H3: two truly concurrent sync executions matching the SAME (savedSearch, tender) pair never create two matches or two notifications", async () => {
    const savedSearch = await prisma.savedSearch.create({
      data: {
        id: randomUUID(),
        organizationId,
        ownerUserId,
        name: "Veille H3",
        includeKeywords: ["cybersécurité"],
        excludeKeywords: [],
        cpvCodes: [],
        countries: [],
        regions: [],
        departments: [],
        cities: [],
        marketTypes: [],
        sources: [],
        includeUnknownAmount: true,
        procedureTypes: [],
        alertInApp: true,
        createdBy: ownerUserId,
      },
    });
    // Le marché existe déjà (résultat d'un cycle précédent) — isole la preuve sur la phase de
    // matching/notification (`recordMatch`/`createNotificationAndEmitEvent`), jamais sur la phase
    // d'upsert d'`ExternalTender` (protégée par le bail `MarketSourceSyncLeaseRepository` en
    // production, hors périmètre de cette preuve — voir le rapport final, section KNOWN_GAPS).
    const externalId = `h3-${randomUUID()}`;
    await prisma.externalTender.create({
      data: { id: randomUUID(), organizationId, source: "BOAMP", marketType: "PUBLIC", externalId, title: "Marché cybersécurité H3", cpvCodes: [], updatedAt: new Date() },
    });
    const connector = new FixedFakeConnector({ items: [{ externalId, title: "Marché cybersécurité H3", cpvCodes: [] }], nextCursor: null });

    const [first, second] = await Promise.all([useCase.execute({ organizationId, connector }), useCase.execute({ organizationId, connector })]);

    expect(first.matchesCreated + second.matchesCreated).toBe(1);
    expect(first.notificationsCreated + second.notificationsCreated).toBe(1);

    const matches = await prisma.savedSearchMatch.findMany({ where: { organizationId, savedSearchId: savedSearch.id } });
    expect(matches).toHaveLength(1);
    const notifications = await prisma.notification.findMany({ where: { organizationId, userId: ownerUserId, type: "SAVED_SEARCH_MATCH", metadata: { path: ["savedSearchId"], equals: savedSearch.id } } });
    expect(notifications).toHaveLength(1);
  }, 30000);
});
