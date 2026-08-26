import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
// Accès direct au repository Prisma de Memberships réservé à ce test (même contournement que
// dce-http.integration.spec.ts) : il n'existe aucune API publique pour créer la toute première
// Membership ADMIN d'une organisation sans passer par une Membership déjà active.
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { buildMinimalPdf } from "../../test-support/pdf-fixture-builder";

type ExtractionSummary = {
  documentId: string;
  status: string;
  strategy?: string;
  attemptCount: number;
  chunkCount?: number;
  characterCount?: number;
};

/**
 * Preuve réelle contre HTTP + PostgreSQL (mission Sprint 3 §19) — mêmes garanties que
 * dce-http.integration.spec.ts : jamais un mock du pipeline, une vraie requête HTTP contre un
 * vrai NestJS + une vraie base. Le traitement est asynchrone (mission §15, dispatch en tâche de
 * fond) : les assertions post-déclenchement passent par `waitForTerminalStatus`, jamais par un
 * `sleep` fixe.
 */
describe("Extraction — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const orgNoEntitlementId = randomUUID();
  const allOrgIds = [orgAId, orgBId, orgNoEntitlementId];
  let tokenAdminNoEntitlement: string;
  let tenderNoEntitlementId: string;
  const userIds: string[] = [];

  let tokenAdminA: string;
  let tokenReadOnlyA: string;
  let tokenAdminB: string;
  let adminAUserId: string;
  let readOnlyAUserId: string;
  let clientAccountAId: string;

  let tenderAId: string;
  let tenderBId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Extraction HTTP Test", termsAccepted: true }),
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

  async function addMembership(input: {
    organizationId: string;
    userId: string;
    role: (typeof OrganizationRole)[keyof typeof OrganizationRole];
  }): Promise<void> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({
        id: MembershipId.from(randomUUID()),
        organizationId: input.organizationId,
        userId: input.userId,
        role: input.role,
        occurredAt: new Date(),
      }),
    );
  }

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId };
  }

  async function ensureDce(tenderId: string, token: string, organizationId: string): Promise<void> {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/dce`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token, organizationId) },
    });
    expect(res.status).toBe(201);
  }

  async function importPdf(input: {
    tenderId: string;
    token: string;
    organizationId: string;
    buffer: Buffer;
    filename: string;
  }): Promise<string> {
    const form = new FormData();
    form.append("files", new Blob([input.buffer], { type: "application/pdf" }), input.filename);
    const res = await fetch(`${baseUrl}/api/v1/tenders/${input.tenderId}/dce/documents`, {
      method: "POST",
      headers: authHeaders(input.token, input.organizationId),
      body: form,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { accepted: { documentId: string }[] };
    expect(body.accepted).toHaveLength(1);
    return body.accepted[0]!.documentId;
  }

  function extractionUrl(tenderId: string, documentId: string, suffix = ""): string {
    return `${baseUrl}/api/v1/tenders/${tenderId}/dce/documents/${documentId}/extraction${suffix}`;
  }

  async function getExtraction(tenderId: string, documentId: string, token: string, organizationId: string) {
    const res = await fetch(extractionUrl(tenderId, documentId), { headers: authHeaders(token, organizationId) });
    return { status: res.status, body: (await res.json()) as ExtractionSummary };
  }

  async function waitForTerminalStatus(
    tenderId: string,
    documentId: string,
    token: string,
    organizationId: string,
    timeoutMs = 20000,
  ): Promise<ExtractionSummary> {
    const terminal = new Set(["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "NOT_PROCESSABLE"]);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { body } = await getExtraction(tenderId, documentId, token, organizationId);
      if (terminal.has(body.status)) {
        return body;
      }
      if (Date.now() > deadline) {
        throw new Error(`Extraction for document ${documentId} did not reach a terminal status in time (last: ${body.status})`);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
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

    await prisma.organization.create({
      data: { id: orgAId, name: "Extraction Org A HTTP", slug: `extraction-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
    await prisma.organization.create({
      data: { id: orgBId, name: "Extraction Org B HTTP", slug: `extraction-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
    // Checkpoint TENDEROS-2.1-P2.3-E12.1 — précondition COMMERCIALE réelle, jamais un contournement
    // du gate. Les routes DCE exercées ici passent par `EntitlementService.runTenderOperationEntitled`
    // (Checkpoint E1.1, FINDING 1) : sans abonnement entitled ni Pass, un 402 est la réponse CORRECTE
    // du produit. `dce-http.integration.spec.ts` avait été mis à jour à E1.1 ; ces specs Extraction,
    // qui appellent pourtant les MÊMES routes, ne l'avaient jamais été — d'où leur échec. ENTERPRISE
    // (illimité) évite tout effet de bord de quota/crédits AO, exactement comme le spec DCE.
    // La preuve du REFUS sans entitlement est faite explicitement par le test dédié plus bas (une
    // organisation SANS abonnement), pour que ce fixture ne puisse jamais masquer une régression du
    // gate — un fixture qui rend seulement le test vert serait précisément le contournement interdit.
    await prisma.organizationSubscription.createMany({
      data: [
        { id: randomUUID(), organizationId: orgAId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
        { id: randomUUID(), organizationId: orgBId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
      ],
    });

    const adminA = await registerAndLogin(`extraction-admin-a-${randomUUID()}@smoke.test`);
    const readOnlyA = await registerAndLogin(`extraction-readonly-a-${randomUUID()}@smoke.test`);
    const adminB = await registerAndLogin(`extraction-admin-b-${randomUUID()}@smoke.test`);
    userIds.push(adminA.userId, readOnlyA.userId, adminB.userId);
    tokenAdminA = adminA.token;
    tokenReadOnlyA = readOnlyA.token;
    tokenAdminB = adminB.token;
    adminAUserId = adminA.userId;
    readOnlyAUserId = readOnlyA.userId;

    await addMembership({ organizationId: orgAId, userId: adminA.userId, role: OrganizationRole.OrganizationAdmin });
    await addMembership({ organizationId: orgAId, userId: readOnlyA.userId, role: OrganizationRole.ReadOnly });
    await addMembership({ organizationId: orgBId, userId: adminB.userId, role: OrganizationRole.OrganizationAdmin });

    const clientAccountA = await prisma.clientAccount.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        name: "Client de test A",
        nameNormalized: "client de test a",
        status: "ACTIVE",
        createdBy: adminA.userId,
      },
    });
    clientAccountAId = clientAccountA.id;
    const clientAccountB = await prisma.clientAccount.create({
      data: {
        id: randomUUID(),
        organizationId: orgBId,
        name: "Client de test B",
        nameNormalized: "client de test b",
        status: "ACTIVE",
        createdBy: adminB.userId,
      },
    });

    tenderAId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderAId, organizationId: orgAId, clientAccountId: clientAccountA.id, title: "Tender A — Extraction HTTP", status: "DRAFT", tags: [], createdBy: adminA.userId },
    });
    tenderBId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderBId, organizationId: orgBId, clientAccountId: clientAccountB.id, title: "Tender B — Extraction HTTP", status: "DRAFT", tags: [], createdBy: adminB.userId },
    });

    // Checkpoint TENDEROS-2.1-P2.3-E12.1 — organisation DÉLIBÉRÉMENT sans abonnement ni Pass, pour
    // prouver que le gate commercial est toujours vivant (voir le test dédié en fin de fichier).
    await prisma.organization.create({
      data: { id: orgNoEntitlementId, name: "Extraction Org sans entitlement", slug: `extraction-org-none-${orgNoEntitlementId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
    const adminNone = await registerAndLogin(`extraction-admin-none-${randomUUID()}@smoke.test`);
    userIds.push(adminNone.userId);
    tokenAdminNoEntitlement = adminNone.token;
    await addMembership({ organizationId: orgNoEntitlementId, userId: adminNone.userId, role: OrganizationRole.OrganizationAdmin });
    const clientAccountNone = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgNoEntitlementId, name: "Client sans entitlement", nameNormalized: "client sans entitlement", status: "ACTIVE", createdBy: adminNone.userId },
    });
    tenderNoEntitlementId = randomUUID();
    await prisma.tender.create({
      data: {
        id: tenderNoEntitlementId,
        organizationId: orgNoEntitlementId,
        clientAccountId: clientAccountNone.id,
        title: "Tender sans entitlement",
        status: "DRAFT",
        tags: [],
        createdBy: adminNone.userId,
      },
    });

    await ensureDce(tenderAId, tokenAdminA, orgAId);
    await ensureDce(tenderBId, tokenAdminB, orgBId);
  }, 60000);

  afterAll(async () => {
    // Checkpoint TENDEROS-2.1-P2.3-E12.4 FIX-1 (H6-01) — l'application est fermee AVANT la purge,
    // jamais apres. Preuve a l'origine de ce correctif : sur 246 organisations residuelles, les
    // tables qui bloquaient encore leur suppression etaient `outbox_events` (440 lignes) et
    // `audit_logs` (218) — ecrites par le travail de fond APRES que ce teardown les ait purgees.
    // La suppression finale de l'organisation violait alors la FK, `afterAll` avortait, et toute
    // la fixture racine (organisation, utilisateurs, sessions) fuyait d'un run a l'autre.
    // `app.close()` attend desormais le travail en vol (`BackgroundTaskRunner`, E12.3) : apres ce
    // point plus aucune ecriture n'est possible, la purge est donc deterministe. Prisma se
    // reconnecte paresseusement pour les suppressions ci-dessous.
    await app.close();
    // Checkpoint TENDEROS-2.1-P2.3-E12.1 — les OutboxEvent portent une FK organisation : sans ce
    // nettoyage, `organization.deleteMany` échoue et laisse des lignes orphelines qui polluent les
    // autres suites. Le défaut était invisible tant que ce spec échouait en 402 AVANT toute écriture
    // métier : corriger l'entitlement a rendu le scénario réellement mutant, donc réellement traçant.
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: allOrgIds } } });
    await prisma.organizationPassPurchase.deleteMany({ where: { organizationId: { in: allOrgIds } } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: { in: allOrgIds } } });
    await prisma.extractionChunk.deleteMany({ where: { organizationId: { in: allOrgIds } } });
    await prisma.extractionAttempt.deleteMany({ where: { organizationId: { in: allOrgIds } } });
    await prisma.documentExtraction.deleteMany({ where: { organizationId: { in: allOrgIds } } });
    await prisma.dceDocument.deleteMany({ where: { organizationId: { in: allOrgIds } } });
    await prisma.dce.deleteMany({ where: { organizationId: { in: allOrgIds } } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: { in: allOrgIds } } });
    await prisma.document.updateMany({ where: { organizationId: { in: allOrgIds } }, data: { currentVersionId: null } });
    await prisma.document.deleteMany({ where: { organizationId: { in: allOrgIds } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: allOrgIds } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: allOrgIds } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: allOrgIds } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: allOrgIds } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: allOrgIds } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: allOrgIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: allOrgIds } } });
  }, 30000);

  it("extracts a real native-text PDF end-to-end: PENDING -> ... -> SUCCEEDED, with persisted chunks", async () => {
    const documentId = await importPdf({
      tenderId: tenderAId,
      token: tokenAdminA,
      organizationId: orgAId,
      buffer: buildMinimalPdf([`Real extractable native PDF text for HTTP test ${randomUUID()}.`]),
      filename: "cctp.pdf",
    });

    const startRes = await fetch(extractionUrl(tenderAId, documentId), {
      method: "POST",
      headers: authHeaders(tokenAdminA, orgAId),
    });
    expect(startRes.status).toBe(202);

    const final = await waitForTerminalStatus(tenderAId, documentId, tokenAdminA, orgAId);
    expect(final.status).toBe("SUCCEEDED");
    expect(final.strategy).toBe("NATIVE_TEXT");
    expect(final.chunkCount).toBeGreaterThan(0);

    const chunks = await prisma.extractionChunk.findMany({ where: { organizationId: orgAId, documentId } });
    expect(chunks.length).toBe(final.chunkCount);
  }, 25000);

  it("READ_ONLY cannot trigger an extraction (403)", async () => {
    const documentId = await importPdf({
      tenderId: tenderAId,
      token: tokenAdminA,
      organizationId: orgAId,
      buffer: buildMinimalPdf([`Readonly guard test ${randomUUID()}.`]),
      filename: "guard.pdf",
    });

    const forbidden = await fetch(extractionUrl(tenderAId, documentId), {
      method: "POST",
      headers: authHeaders(tokenReadOnlyA, orgAId),
    });
    expect(forbidden.status).toBe(403);
  }, 25000);

  // Mission Sprint 8A.2 (audit isolation inter-client) — régression : avant ce correctif, un
  // READ_ONLY SANS affectation client pouvait tout de même lire l'extraction de N'IMPORTE QUEL
  // Tender de l'organisation (aucun `GetTenderUseCase` n'était jamais appelé avec `actorId`, donc
  // `AssertClientAccessUseCase` n'était jamais déclenché). `readOnlyA` n'a encore ici aucune
  // `ClientAssignment` — cette lecture doit être refusée, jamais un contournement silencieux.
  it("READ_ONLY without any client assignment cannot read an extraction status either (404, never a silent bypass)", async () => {
    const documentId = await importPdf({
      tenderId: tenderAId,
      token: tokenAdminA,
      organizationId: orgAId,
      buffer: buildMinimalPdf([`Unassigned readonly guard test ${randomUUID()}.`]),
      filename: "unassigned-guard.pdf",
    });
    await fetch(extractionUrl(tenderAId, documentId), { method: "POST", headers: authHeaders(tokenAdminA, orgAId) });
    await waitForTerminalStatus(tenderAId, documentId, tokenAdminA, orgAId);

    const { status } = await getExtraction(tenderAId, documentId, tokenReadOnlyA, orgAId);
    expect(status).toBe(404);
  }, 25000);

  it("READ_ONLY can read the extraction status once genuinely assigned to the client (200, access not over-restricted)", async () => {
    const documentId = await importPdf({
      tenderId: tenderAId,
      token: tokenAdminA,
      organizationId: orgAId,
      buffer: buildMinimalPdf([`Assigned readonly guard test ${randomUUID()}.`]),
      filename: "assigned-guard.pdf",
    });
    await fetch(extractionUrl(tenderAId, documentId), { method: "POST", headers: authHeaders(tokenAdminA, orgAId) });
    await waitForTerminalStatus(tenderAId, documentId, tokenAdminA, orgAId);

    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientAccountAId, userId: readOnlyAUserId, role: "VIEWER", createdBy: adminAUserId },
    });

    const { status } = await getExtraction(tenderAId, documentId, tokenReadOnlyA, orgAId);
    expect(status).toBe(200);
  }, 25000);

  it("a corrupted PDF (valid magic bytes, invalid structure) ends FAILED, and a retry re-attempts and stays coherent", async () => {
    const documentId = await importPdf({
      tenderId: tenderAId,
      token: tokenAdminA,
      organizationId: orgAId,
      buffer: Buffer.from(`%PDF-1.4 not a real structurally valid pdf ${randomUUID()}`),
      filename: "corrupted.pdf",
    });

    await fetch(extractionUrl(tenderAId, documentId), { method: "POST", headers: authHeaders(tokenAdminA, orgAId) });
    const failed = await waitForTerminalStatus(tenderAId, documentId, tokenAdminA, orgAId);
    expect(failed.status).toBe("FAILED");
    expect(failed.attemptCount).toBe(1);

    const retryRes = await fetch(extractionUrl(tenderAId, documentId, "/retry"), {
      method: "POST",
      headers: authHeaders(tokenAdminA, orgAId),
    });
    expect(retryRes.status).toBe(202);

    const afterRetry = await waitForTerminalStatus(tenderAId, documentId, tokenAdminA, orgAId);
    expect(afterRetry.status).toBe("FAILED");
    expect(afterRetry.attemptCount).toBe(2);

    // Jamais de doublon de chunks à travers un retry (mission §15/§16), même sur un échec répété.
    const chunkCount = await prisma.extractionChunk.count({ where: { organizationId: orgAId, documentId } });
    expect(chunkCount).toBe(0);
  }, 25000);

  it("two concurrent start requests for the same document result in exactly one coherent terminal outcome (no duplicated chunks)", async () => {
    const documentId = await importPdf({
      tenderId: tenderAId,
      token: tokenAdminA,
      organizationId: orgAId,
      buffer: buildMinimalPdf([`Concurrency test content ${randomUUID()}.`]),
      filename: "concurrency.pdf",
    });

    const [first, second] = await Promise.all([
      fetch(extractionUrl(tenderAId, documentId), { method: "POST", headers: authHeaders(tokenAdminA, orgAId) }),
      fetch(extractionUrl(tenderAId, documentId), { method: "POST", headers: authHeaders(tokenAdminA, orgAId) }),
    ]);
    expect([first.status, second.status]).toEqual([202, 202]);

    const final = await waitForTerminalStatus(tenderAId, documentId, tokenAdminA, orgAId);
    expect(final.status).toBe("SUCCEEDED");
    // Un seul jeu de chunks, jamais un doublon issu du second déclenchement concurrent.
    const attempts = await prisma.extractionAttempt.findMany({ where: { organizationId: orgAId, documentId } });
    expect(attempts).toHaveLength(1);
    const chunkCount = await prisma.extractionChunk.count({ where: { organizationId: orgAId, documentId } });
    expect(chunkCount).toBe(final.chunkCount);
  }, 25000);

  it("org B cannot start, read, or retry org A's extraction (404)", async () => {
    const documentId = await importPdf({
      tenderId: tenderAId,
      token: tokenAdminA,
      organizationId: orgAId,
      buffer: buildMinimalPdf([`Cross-tenant isolation test ${randomUUID()}.`]),
      filename: "isolated.pdf",
    });

    const crossStart = await fetch(extractionUrl(tenderAId, documentId), {
      method: "POST",
      headers: authHeaders(tokenAdminB, orgBId),
    });
    expect(crossStart.status).toBe(404);

    const crossGet = await fetch(extractionUrl(tenderAId, documentId), { headers: authHeaders(tokenAdminB, orgBId) });
    expect(crossGet.status).toBe(404);

    const crossRetry = await fetch(extractionUrl(tenderAId, documentId, "/retry"), {
      method: "POST",
      headers: authHeaders(tokenAdminB, orgBId),
    });
    expect(crossRetry.status).toBe(404);

    // org B ne doit jamais réussir à injecter le tenderId d'org A en s'authentifiant comme org B.
    const crossGetOwnOrgHeaderButForeignTender = await fetch(extractionUrl(tenderAId, documentId), {
      headers: authHeaders(tokenAdminA, orgBId),
    });
    expect(crossGetOwnOrgHeaderButForeignTender.status).toBe(404);
  });

  /**
   * Checkpoint TENDEROS-2.1-P2.3-E12.1 — le gate commercial E1.1/E1.3 dans LES DEUX SENS, sur la
   * route réellement gatée. Sans cette preuve, le fixture ENTERPRISE ajouté en `beforeAll` pourrait
   * masquer silencieusement une désactivation future du gate : ce test échouerait alors, et c'est
   * exactement son rôle.
   */
  it("BLOQUANT (gate commercial) — sans abonnement ni Pass, l'import DCE est refusé 402 ; l'octroi d'un Pass réel le débloque et le Pass est RÉSERVÉ sur ce Tender", async () => {
    const dceUrl = `${baseUrl}/api/v1/tenders/${tenderNoEntitlementId}/dce`;
    const headers = { "Content-Type": "application/json", ...authHeaders(tokenAdminNoEntitlement, orgNoEntitlementId) };

    // 1) REFUS — l'organisation n'a ni abonnement entitled ni Pass disponible.
    const denied = await fetch(dceUrl, { method: "POST", headers });
    expect(denied.status).toBe(402);
    const deniedBody = (await denied.json()) as { error?: { code?: string } };
    expect(deniedBody.error?.code).toBe("TENDER_OPERATION_NOT_ENTITLED");

    // Aucune écriture métier ne doit avoir eu lieu malgré le refus.
    expect(await prisma.dce.count({ where: { organizationId: orgNoEntitlementId } })).toBe(0);

    // 2) OCTROI d'un Pass RÉEL (jamais un bypass du gate, jamais des crédits infinis globaux).
    const passId = randomUUID();
    await prisma.organizationPassPurchase.create({
      data: {
        id: passId,
        organizationId: orgNoEntitlementId,
        status: "AVAILABLE",
        externalReference: `e12-1-entitlement-proof-${passId}`,
        priceCents: 9900,
        currency: "EUR",
      },
    });

    // 3) AUTORISÉ — même requête, même acteur, seule la précondition commerciale a changé.
    const allowed = await fetch(dceUrl, { method: "POST", headers });
    expect(allowed.status).toBe(201);
    expect(await prisma.dce.count({ where: { organizationId: orgNoEntitlementId } })).toBe(1);

    // 4) CONSOMMATION conforme à E1.2/E1.3 : le Pass est RÉSERVÉ sur CE Tender (affectation au
    //    premier usage métier payant), jamais consommé commercialement à ce stade — la consommation
    //    définitive (`consumedTenderId`) n'intervient qu'au premier dépôt réussi (E9).
    const pass = await prisma.organizationPassPurchase.findUniqueOrThrow({ where: { id: passId } });
    expect(pass.status).toBe("RESERVED");
    expect(pass.reservedTenderId).toBe(tenderNoEntitlementId);
    expect(pass.reservedAt).not.toBeNull();
    expect(pass.consumedTenderId).toBeNull();
  }, 30000);
});
