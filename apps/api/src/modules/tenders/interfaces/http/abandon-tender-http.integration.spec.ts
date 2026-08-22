import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationRole } from "../../../memberships/domain/organization-role";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1.4, mission §7-§13 — preuve HTTP + PostgreSQL RÉELLE (jamais un
 * fake en mémoire) de l'action explicite "Abandonner l'appel d'offres" (`POST /tenders/:id/abandon`)
 * et de son interaction avec le Pass AO : une organisation Pass-only DÉDIÉE (jamais d'abonnement —
 * contrairement à `tenders-sprint3-http.integration.spec.ts`, ENTERPRISE, qui ne passerait jamais
 * par la branche Pass) pour prouver mission §11 (release AVANT consommation, Pass réutilisable par
 * un autre Tender) et §12 (aucun remboursement APRÈS consommation, CONSUMED reste CONSUMED).
 */
describe("Tenders — abandon (Checkpoint TENDEROS-2.1-P2.3-E1.4) — HTTP + PostgreSQL réel", () => {
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
      body: JSON.stringify({ email, password, displayName: "Abandon Pass HTTP Test", termsAccepted: true }),
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

  async function createTender(): Promise<string> {
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: orgId, clientAccountId, title: "Marche Abandon HTTP", status: "IN_ANALYSIS", tags: [], createdBy: ownerUserId },
    });
    return tender.id;
  }

  async function seedAvailablePass(): Promise<string> {
    const pass = await prisma.organizationPassPurchase.create({
      data: { id: randomUUID(), organizationId: orgId, status: "AVAILABLE", externalReference: `cs_test_${randomUUID()}`, priceCents: 9900, currency: "EUR" },
    });
    return pass.id;
  }

  /** Réserve réellement le Pass AVAILABLE de l'organisation pour ce Tender en déclenchant une VRAIE
   *  opération cœur AO déjà gatée (E1.1) — jamais une manipulation directe de `status` en base, pour
   *  prouver le VRAI chemin `runTenderOperationEntitled` -> `ReservePassForTenderUseCase`. */
  async function reservePassViaRealCoreOperation(tenderId: string): Promise<void> {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/dce`, { method: "POST", headers: authHeaders() });
    expect(res.status).toBe(201);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleRef.get(PrismaService);

    // Organisation Pass-only — AUCUN abonnement seedé (contrairement à tous les autres fichiers
    // HTTP de ce module), délibérément, pour exercer la VRAIE branche Pass de l'entitlement.
    await prisma.organization.create({
      data: { id: orgId, name: "Abandon Pass Org HTTP", slug: `abandon-pass-org-http-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });

    const owner = await registerAndLogin(`abandon-owner-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    ownerToken = owner.token;
    ownerUserId = owner.userId;

    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: owner.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgId, name: "Client Abandon HTTP", nameNormalized: "client abandon http", status: "ACTIVE", createdBy: owner.userId },
    });
    clientAccountId = clientAccount.id;
  }, 60000);

  // Checkpoint TENDEROS-2.1-P2.3-E1.4 — nettoyage APRÈS CHAQUE test (jamais seulement en fin de
  // fichier) : sans ceci, un Pass laissé AVAILABLE par un test précédent (ex. "mission §9.7") peut
  // être choisi par erreur par `reservePassViaRealCoreOperation` du test SUIVANT à la place du Pass
  // fraîchement seedé pour CE test (`findFirstAvailable` trie par `purchasedAt ASC`, le plus ancien
  // Pass encore AVAILABLE gagne) — même leçon déjà appliquée à
  // `prisma-pass-purchase.repository.integration.spec.ts` (E1.3).
  afterEach(async () => {
    await prisma.organizationPassPurchase.deleteMany({ where: { organizationId: orgId } });
  });

  afterAll(async () => {
    await prisma.dceDocument.deleteMany({ where: { organizationId: orgId } });
    await prisma.dce.deleteMany({ where: { organizationId: orgId } });
    await prisma.tenderStatusHistoryEntry.deleteMany({ where: { organizationId: orgId } });
    await prisma.tender.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  it("mission §11 — a Pass RESERVED for Tender A is released back to AVAILABLE by an explicit abandon, and a DIFFERENT Tender B can then legitimately reserve it (proof against real Postgres)", async () => {
    const passId = await seedAvailablePass();
    const tenderAId = await createTender();
    await reservePassViaRealCoreOperation(tenderAId);

    const reservedRow = await prisma.organizationPassPurchase.findUniqueOrThrow({ where: { id: passId } });
    expect(reservedRow.status).toBe("RESERVED");
    expect(reservedRow.reservedTenderId).toBe(tenderAId);

    const abandonRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/abandon`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ reason: "Client ne poursuit plus cet AO" }) });
    expect(abandonRes.status).toBe(200);
    const abandonBody = (await abandonRes.json()) as { tender: { status: string }; passReleaseOutcome: string };
    expect(abandonBody.tender.status).toBe("ARCHIVED");
    expect(abandonBody.passReleaseOutcome).toBe("RELEASED");

    const releasedRow = await prisma.organizationPassPurchase.findUniqueOrThrow({ where: { id: passId } });
    expect(releasedRow.status).toBe("AVAILABLE");
    expect(releasedRow.reservedTenderId).toBeNull();

    // Tender B — un AUTRE Tender de la même organisation peut désormais légitimement réserver le
    // MÊME Pass, prouvant qu'il n'est jamais resté immobilisé.
    const tenderBId = await createTender();
    await reservePassViaRealCoreOperation(tenderBId);
    const reservedForBRow = await prisma.organizationPassPurchase.findUniqueOrThrow({ where: { id: passId } });
    expect(reservedForBRow.status).toBe("RESERVED");
    expect(reservedForBRow.reservedTenderId).toBe(tenderBId);
  });

  it("mission §9.7 — abandoning an ALREADY-abandoned Tender is idempotent (never throws, never re-releases what's already released)", async () => {
    const passId = await seedAvailablePass();
    const tenderId = await createTender();
    await reservePassViaRealCoreOperation(tenderId);

    const first = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/abandon`, { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
    expect(first.status).toBe(200);
    const second = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/abandon`, { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { tender: { status: string }; passReleaseOutcome: string };
    expect(secondBody.tender.status).toBe("ARCHIVED"); // status transition skipped silently, jamais une InvalidTenderStatusTransitionError
    expect(secondBody.passReleaseOutcome).toBe("NO_PASS_ASSIGNED"); // déjà libéré par le premier appel, no-op sûr

    const row = await prisma.organizationPassPurchase.findUniqueOrThrow({ where: { id: passId } });
    expect(row.status).toBe("AVAILABLE");
  });

  it("mission §12 — a Pass CONSUMED for a Tender is NEVER refunded by abandon: it stays CONSUMED, and the Tender is still archived", async () => {
    const passId = await seedAvailablePass();
    const tenderId = await createTender();
    await reservePassViaRealCoreOperation(tenderId);
    // Simule le premier dépôt réussi (le flux Submission complet est hors du périmètre de CE test,
    // déjà prouvé ailleurs — E1.2/E1.3) : force directement la transition RESERVED -> CONSUMED,
    // même état final qu'un dépôt réel.
    await prisma.organizationPassPurchase.update({ where: { id: passId }, data: { status: "CONSUMED", consumedTenderId: tenderId, consumedAt: new Date() } });

    const abandonRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/abandon`, { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
    expect(abandonRes.status).toBe(200);
    const abandonBody = (await abandonRes.json()) as { tender: { status: string }; passReleaseOutcome: string };
    expect(abandonBody.tender.status).toBe("ARCHIVED"); // le Tender lui-même est bien abandonné/archivé
    expect(abandonBody.passReleaseOutcome).toBe("ALREADY_CONSUMED"); // jamais "RELEASED"

    const row = await prisma.organizationPassPurchase.findUniqueOrThrow({ where: { id: passId } });
    expect(row.status).toBe("CONSUMED"); // JAMAIS remboursé
    expect(row.consumedTenderId).toBe(tenderId);
  });

  it("mission §6 (TEST D) — two truly concurrent abandon calls for the SAME Tender converge to one coherent state: exactly one logical release, no duplicate history, never a 500", async () => {
    const passId = await seedAvailablePass();
    const tenderId = await createTender();
    await reservePassViaRealCoreOperation(tenderId);

    const [first, second] = await Promise.all([
      fetch(`${baseUrl}/api/v1/tenders/${tenderId}/abandon`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ reason: "Course concurrente A" }) }),
      fetch(`${baseUrl}/api/v1/tenders/${tenderId}/abandon`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ reason: "Course concurrente B" }) }),
    ]);

    // Mission §6 exige littéralement "aucune erreur 500" — jamais "toujours 200" : `Tender.save`
    // utilise le MÊME verrouillage optimiste (version compare-and-set) que toute autre mutation
    // Tender du dépôt, pré-existant et non spécifique à l'abandon — le perdant légitime d'une VRAIE
    // course reçoit 409 TENDER_CONCURRENT_MODIFICATION (conflit propre, jamais une erreur serveur),
    // le gagnant reçoit 200. Les deux issues sont un succès du point de vue de CE test : ce qui
    // compte, c'est la convergence de l'état final ci-dessous, jamais un double effet ni un 500.
    expect([200, 409]).toContain(first.status);
    expect([200, 409]).toContain(second.status);
    expect([first.status, second.status]).toContain(200); // au moins un des deux a réellement abouti

    const passRow = await prisma.organizationPassPurchase.findUniqueOrThrow({ where: { id: passId } });
    expect(passRow.status).toBe("AVAILABLE");
    expect(passRow.reservedTenderId).toBeNull();

    const tenderRow = await prisma.tender.findUniqueOrThrow({ where: { id: tenderId } });
    expect(tenderRow.status).toBe("ARCHIVED");

    // Une seule transition RÉELLEMENT persistée dans l'historique — la seconde course, quel que soit
    // l'ordre réel d'exécution, ne doit jamais produire une entrée dupliquée/incohérente (mission §6
    // "aucun double historique incohérent").
    const historyRows = await prisma.tenderStatusHistoryEntry.findMany({ where: { tenderId } });
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]?.newStatus).toBe("ARCHIVED");
  });

  it("mission §10 — abandoning a Tender covered only by a subscription (no Pass ever assigned) works normally, never touches any Pass", async () => {
    const tenderId = await createTender();
    // Aucun Pass n'existe pour cette organisation à cet instant (le précédent a été consommé dans
    // le test ci-dessus, resté CONSUMED, jamais réutilisable) — ce Tender n'a jamais eu de Pass
    // affecté, simulant une couverture par abonnement (hors périmètre direct de ce fichier Pass-only,
    // mais le comportement d'abandon doit rester sûr même sans Pass du tout).
    const abandonRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/abandon`, { method: "POST", headers: authHeaders(), body: JSON.stringify({}) });
    expect(abandonRes.status).toBe(200);
    const abandonBody = (await abandonRes.json()) as { tender: { status: string }; passReleaseOutcome: string };
    expect(abandonBody.tender.status).toBe("ARCHIVED");
    expect(abandonBody.passReleaseOutcome).toBe("NO_PASS_ASSIGNED");
  });
});
