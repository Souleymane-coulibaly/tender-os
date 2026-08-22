import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { AUDIT_LOG_WRITER, type AuditLogWriter, type TenderAuditLogEntry } from "../../application/ports/audit-log-writer";
import { PrismaAuditLogWriter } from "../../infrastructure/prisma-audit-log.writer";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1.5, mission §4/§7 (ATOMICITÉ ABANDON — FAILURE INJECTION) —
 * `AbandonTenderUseCase` enveloppe désormais archive + release Pass + audit + outbox dans UNE SEULE
 * transaction Postgres (`AtomicTransactionRunner`, voir la docstring de la classe). Ce fichier prouve
 * contre PostgreSQL RÉEL qu'un échec survenant n'importe où DANS cette opération (ici : l'écriture de
 * l'entrée d'audit `tender.abandoned`, volontairement la DERNIÈRE étape avant l'outbox — après que
 * archive ET release aient déjà été exécutés dans la MÊME transaction, mais pas encore committés)
 * fait avorter la transaction dans son ENTIER : ni la transition de statut, ni l'entrée d'historique,
 * ni la libération du Pass ne sont jamais persistées — jamais un état partiel durable (mission §7 CAS
 * A/CAS B, formulées génériquement ici comme "une exception survient au milieu de l'opération").
 *
 * Technique : `overrideProvider(AUDIT_LOG_WRITER)` (le token PROPRE au module `tenders`, distinct de
 * celui de `billing`/`memberships`/tout autre module — un `Symbol()` par fichier de port, jamais
 * partagé) — délègue au VRAI `PrismaAuditLogWriter` pour toute action AUTRE que `tender.abandoned`
 * (setup `beforeAll`/réservation du Pass via DCE restent inchangés, réels), et lève une erreur
 * injectée UNIQUEMENT pour cette action précise. Aucun mock des repositories eux-mêmes (mission §2
 * "ne pas mocker les repositories") — seule la couche audit-log est substituée, par un wrapper qui
 * délègue à l'implémentation Prisma réelle dans le cas nominal.
 */
describe("Tenders — abandon atomicity (Checkpoint TENDEROS-2.1-P2.3-E1.5, mission §4/§7) — HTTP + PostgreSQL réel, failure injection", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const userIds: string[] = [];
  let ownerToken: string;
  let ownerUserId: string;
  let clientAccountId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Abandon Atomicity HTTP Test", termsAccepted: true }),
    });
    const user = (await registerRes.json()) as { id: string };
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    return { userId: user.id, token: accessToken };
  }

  function authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${ownerToken}`, "X-Organization-Id": orgId, "Content-Type": "application/json" };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUDIT_LOG_WRITER)
      .useFactory({
        factory: (prismaService: PrismaService): AuditLogWriter => {
          const real = new PrismaAuditLogWriter(prismaService);
          return {
            record: async (entry: TenderAuditLogEntry) => {
              if (entry.action === "tender.abandoned") {
                throw new Error("Injected failure — Checkpoint TENDEROS-2.1-P2.3-E1.5 mission §7 (ATOMICITÉ ABANDON, failure injection)");
              }
              return real.record(entry);
            },
          };
        },
        inject: [PrismaService],
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleRef.get(PrismaService);

    await prisma.organization.create({
      data: { id: orgId, name: "Abandon Atomicity Org HTTP", slug: `abandon-atomicity-org-http-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
    await prisma.organizationSubscription.create({
      data: { id: randomUUID(), organizationId: orgId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
    });

    const owner = await registerAndLogin(`abandon-atomicity-owner-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    ownerToken = owner.token;
    ownerUserId = owner.userId;

    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: owner.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgId, name: "Client Abandon Atomicity HTTP", nameNormalized: "client abandon atomicity http", status: "ACTIVE", createdBy: owner.userId },
    });
    clientAccountId = clientAccount.id;
  }, 60000);

  afterAll(async () => {
    await prisma.organizationPassPurchase.deleteMany({ where: { organizationId: orgId } });
    await prisma.tenderStatusHistoryEntry.deleteMany({ where: { organizationId: orgId } });
    await prisma.tender.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  it("mission §7 (FAILURE INJECTION) — an exception raised inside the single atomic operation rolls back the status transition, the status-history entry, AND the Pass release together — no partial state, ever", async () => {
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: orgId, clientAccountId, title: "Marche Abandon Atomicity HTTP", status: "IN_ANALYSIS", tags: [], createdBy: ownerUserId },
    });
    // Réservation directe en base — ce fichier ne porte pas sur le VRAI chemin de réservation
    // (déjà prouvé ailleurs, `reservePassViaRealCoreOperation` dans `abandon-tender-http.integration.spec.ts`) ;
    // seule l'atomicité de l'abandon lui-même est sous test ici.
    const pass = await prisma.organizationPassPurchase.create({
      data: { id: randomUUID(), organizationId: orgId, status: "RESERVED", externalReference: `cs_test_${randomUUID()}`, priceCents: 9900, currency: "EUR", reservedTenderId: tender.id, reservedAt: new Date() },
    });

    const abandonRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/abandon`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ reason: "Failure injection test" }) });
    // La transaction avorte : l'exception injectée doit remonter comme une erreur serveur, jamais un
    // 200 masquant un échec partiel.
    expect(abandonRes.status).toBeGreaterThanOrEqual(500);

    // Preuve directe PostgreSQL — AUCUNE des trois écritures de l'opération n'a survécu.
    const tenderRow = await prisma.tender.findUniqueOrThrow({ where: { id: tender.id } });
    expect(tenderRow.status).toBe("IN_ANALYSIS"); // jamais ARCHIVED — le changement a été annulé

    const historyRows = await prisma.tenderStatusHistoryEntry.findMany({ where: { tenderId: tender.id } });
    expect(historyRows).toHaveLength(0); // jamais une entrée orpheline pour une transition annulée

    const passRow = await prisma.organizationPassPurchase.findUniqueOrThrow({ where: { id: pass.id } });
    expect(passRow.status).toBe("RESERVED"); // jamais AVAILABLE — la release a été annulée avec le reste
    expect(passRow.reservedTenderId).toBe(tender.id);
  });
});
