import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { ACCESS_TOKEN_SERVICE, type AccessTokenService } from "../../../identity/application/ports/access-token.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { buildPricingFixtureBuffer } from "../../test-support/build-pricing-fixture";

/**
 * V2 Sprint 13 (Chiffrage BPU/DPGF/DQE) — preuve réelle contre HTTP + PostgreSQL (NestJS), même
 * motif que `technical-memo-http.integration.spec.ts` (Sprint 12) : un flux principal réel bout en
 * bout (détection DCE → extraction XLSX réelle → saisie de prix → validation → génération d'un
 * fichier financier final réellement écrit sur disque/stockage), puis les tests BLOQUANTS exigés
 * par la mission — same-org cross-client (prix secret jamais visible d'un autre candidat/acteur
 * sans accès), ClientAccess révoqué en cours de route, cross-org anti-IDOR, mass-assignment.
 */
describe("Chiffrage (pricing-schedule) — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessTokenService: AccessTokenService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenOwnerB: string;
  let ownerAUserId: string;

  /**
   * Checkpoint TENDEROS-2.1-P2.3-E12.1 — ce fichier a besoin de 6 acteurs, soit 12 requêtes sur
   * `/auth/register` + `/auth/login`, qui PARTAGENT un même bucket de rate limiting réel de 10
   * requêtes / 60 s par IP (`AuthThrottlerGuard`, Sprint 21). Le 6e acteur recevait donc un 429
   * parfaitement CORRECT du produit — mais l'ancienne version de ce helper ne vérifiait aucun statut
   * HTTP : elle renvoyait `userId: undefined`, qui ne faisait surface que bien plus tard sous la
   * forme d'une erreur Prisma incompréhensible (`in[5]: undefined` au teardown). Le rate limiter
   * n'est jamais désactivé ni contourné en production ; ce spec ne teste tout simplement pas le flux
   * d'authentification (couvert par les specs du module `identity`), il crée donc ses acteurs
   * directement — même motif que `documents-tenant-isolation` et `dashboard-query-bounding`.
   */
  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email, displayName: "Pricing Schedule HTTP Test", status: "ACTIVE", passwordHash: "not-used-direct-actor-creation" } });
    const sessionId = randomUUID();
    await prisma.session.create({ data: { id: sessionId, userId, expiresAt: new Date(Date.now() + 3600_000) } });
    return { userId, token: accessTokenService.issue({ userId, sessionId }, 3600) };
  }

  async function addMembership(input: { organizationId: string; userId: string; role: (typeof OrganizationRole)[keyof typeof OrganizationRole] }): Promise<void> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: input.organizationId, userId: input.userId, role: input.role, occurredAt: new Date() }),
    );
  }

  async function assignClient(input: { organizationId: string; clientAccountId: string; userId: string; role: "CLIENT_MANAGER" | "CONTRIBUTOR" | "VIEWER"; createdBy: string }): Promise<void> {
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: input.organizationId, clientAccountId: input.clientAccountId, userId: input.userId, role: input.role, createdBy: input.createdBy },
    });
  }

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  async function createClientAndTender(input: { organizationId: string; userId: string }): Promise<{ clientAccountId: string; tenderId: string }> {
    const suffix = randomUUID();
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: input.organizationId, name: `Client Chiffrage ${suffix}`, nameNormalized: `client chiffrage ${suffix}`, status: "ACTIVE", createdBy: input.userId },
    });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: input.organizationId, clientAccountId: clientAccount.id, title: "Marche Chiffrage HTTP", status: "IN_ANALYSIS", tags: [], createdBy: input.userId },
    });
    return { clientAccountId: clientAccount.id, tenderId: tender.id };
  }

  /** Upload la fixture BPU réelle (headers Désignation/Unité/Quantité/PU) dans le DCE du Tender —
   *  jamais un second mécanisme de stockage : passe par la VRAIE route d'import DCE. */
  async function importBpuDocument(input: { tenderId: string; token: string; organizationId: string; filename?: string }): Promise<{ documentId: string; currentVersionId: string }> {
    await fetch(`${baseUrl}/api/v1/tenders/${input.tenderId}/dce`, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.token}`, "X-Organization-Id": input.organizationId, "Content-Type": "application/json" },
    });
    const form = new FormData();
    form.append("files", new Blob([buildPricingFixtureBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), input.filename ?? "BPU_Lot1.xlsx");
    const res = await fetch(`${baseUrl}/api/v1/tenders/${input.tenderId}/dce/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.token}`, "X-Organization-Id": input.organizationId },
      body: form,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { accepted: { documentId: string; currentVersionId: string }[] };
    expect(body.accepted).toHaveLength(1);
    return { documentId: body.accepted[0]!.documentId, currentVersionId: body.accepted[0]!.currentVersionId };
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
    accessTokenService = moduleRef.get(ACCESS_TOKEN_SERVICE);

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Chiffrage Org A HTTP", slug: `chiffrage-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Chiffrage Org B HTTP", slug: `chiffrage-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    // Checkpoint TENDEROS-2.1-P2.3-E1.4, mission §15 (dette secondaire) — Pricing Schedule est
    // désormais entitlement-gated (mission §1/§2, P1 Codex) : sans ceci, le fixture `importBpuDocument`
    // (qui passe par le VRAI endpoint DCE, lui-même gaté depuis E1.1) échouerait en 402 avant même
    // d'atteindre le scénario réellement testé par ce fichier. Même motif déjà établi dans
    // dce-http.integration.spec.ts/analysis-http.integration.spec.ts/response-package-http.integration.spec.ts
    // — ENTERPRISE (illimité) pour ne jamais faire porter à ces tests un souci de quota/AO credits
    // qui n'est pas leur sujet.
    await prisma.organizationSubscription.createMany({
      data: [
        { id: randomUUID(), organizationId: orgAId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
        { id: randomUUID(), organizationId: orgBId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
      ],
    });

    const ownerA = await registerAndLogin(`chiffrage-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`chiffrage-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId);
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;
    ownerAUserId = ownerA.userId;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });
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
    await prisma.pricingScheduleFinalFile.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.pricingScheduleLine.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.pricingScheduleVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.pricingSchedule.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.extractionChunk.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentExtraction.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.dceDocument.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.dce.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentTenderAssociation.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.document.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.candidateCompany.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.$disconnect();
  }, 60000);

  it("main flow: detect (DCE) → create → extract (real XLSX) → price → validate → generate a real final file", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const bpu = await importBpuDocument({ tenderId, token: tokenOwnerA, organizationId: orgAId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing-schedules`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ sourceDocumentId: bpu.documentId }),
    });
    expect(createRes.status).toBe(201);
    const schedule = (await createRes.json()) as { id: string; financialDocumentType: string; status: string };
    expect(schedule.financialDocumentType).toBe("BPU");
    expect(schedule.status).toBe("DRAFT");

    const extractRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}/extract`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ sourceDocumentVersionId: bpu.currentVersionId }),
    });
    expect(extractRes.status).toBe(201);
    const extracted = (await extractRes.json()) as { version: { id: string; versionNumber: number }; lines: { id: string; designation: string; kind: string }[] };
    expect(extracted.version.versionNumber).toBe(1);
    const priceableLines = extracted.lines.filter((l) => l.kind === "PRICE_ITEM");
    expect(priceableLines.length).toBeGreaterThanOrEqual(2);

    for (const line of priceableLines) {
      const priceRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}/lines/${line.id}/price`, {
        method: "PATCH",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ unitPrice: "12.50" }),
      });
      expect(priceRes.status).toBe(200);
    }

    const controlsRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}/versions/${extracted.version.id}/controls`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(controlsRes.status).toBe(200);
    const controls = (await controlsRes.json()) as { errorCount: number };
    expect(controls.errorCount).toBe(0);

    const validateRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}/versions/${extracted.version.id}/validate`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({}),
    });
    expect(validateRes.status).toBe(200);
    const validated = (await validateRes.json()) as { status: string };
    expect(validated.status).toBe("VALIDATED");

    const generateRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}/versions/${extracted.version.id}/generate`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({}),
    });
    expect(generateRes.status).toBe(201);
    const finalFile = (await generateRes.json()) as { documentId: string; documentVersionId: string; injectedCellCount: number };
    expect(finalFile.injectedCellCount).toBe(priceableLines.length);
    // Mission §9 — l'ORIGINAL (bpu.documentId) reste distinct du fichier final généré, jamais le
    // même Document réécrit en place.
    expect(finalFile.documentId).not.toBe(bpu.documentId);
  });

  it("mass assignment — organizationId/clientAccountId/status/currentVersionId are never accepted from the client body (Sprint 21 hardening — .strict() rejects the request, same convention as every other module)", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const bpu = await importBpuDocument({ tenderId, token: tokenOwnerA, organizationId: orgAId });
    const foreignOrgUser = await registerAndLogin(`chiffrage-foreign-${randomUUID()}@smoke.test`);
    userIds.push(foreignOrgUser.userId);

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing-schedules`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({
        sourceDocumentId: bpu.documentId,
        organizationId: orgBId,
        clientAccountId: randomUUID(),
        status: "VALIDATED",
        currentVersionId: randomUUID(),
        currentVersionNumber: 999,
      }),
    });
    expect(createRes.status).toBe(400);

    const legitimateRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing-schedules`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ sourceDocumentId: bpu.documentId }),
    });
    expect(legitimateRes.status).toBe(201);
    const schedule = (await legitimateRes.json()) as { organizationId: string; tenderId: string; status: string; currentVersionId?: string; currentVersionNumber: number };
    expect(schedule.organizationId).toBe(orgAId);
    expect(schedule.tenderId).toBe(tenderId);
    expect(schedule.status).toBe("DRAFT");
    expect(schedule.currentVersionId).toBeUndefined();
    expect(schedule.currentVersionNumber).toBe(0);
  });

  it("BLOCKING — a secret unit price is never visible to a same-org actor without access to this client (cross-client isolation)", async () => {
    const clientA = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const clientB = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const bpu = await importBpuDocument({ tenderId: clientA.tenderId, token: tokenOwnerA, organizationId: orgAId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/pricing-schedules`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ sourceDocumentId: bpu.documentId }),
    });
    const schedule = (await createRes.json()) as { id: string };
    const extractRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}/extract`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ sourceDocumentVersionId: bpu.currentVersionId }),
    });
    const extracted = (await extractRes.json()) as { version: { id: string }; lines: { id: string; kind: string }[] };
    const secretLine = extracted.lines.find((l) => l.kind === "PRICE_ITEM")!;

    const secretPriceRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}/lines/${secretLine.id}/price`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ unitPrice: "98765.43" }),
    });
    expect(secretPriceRes.status).toBe(200);

    // Jean n'a d'accès QU'au Client B — jamais au Client A.
    const jean = await registerAndLogin(`chiffrage-jean-${randomUUID()}@smoke.test`);
    userIds.push(jean.userId);
    await addMembership({ organizationId: orgAId, userId: jean.userId, role: OrganizationRole.Contributor });
    await assignClient({ organizationId: orgAId, clientAccountId: clientB.clientAccountId, userId: jean.userId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/pricing-schedules`, { headers: authHeaders(jean.token, orgAId) });
    expect(listRes.status).toBe(404);

    const getRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}?versionId=${extracted.version.id}`, { headers: authHeaders(jean.token, orgAId) });
    expect(getRes.status).toBe(404);
    const getBody = await getRes.text();
    expect(getBody).not.toContain("98765.43");

    const priceEditRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}/lines/${secretLine.id}/price`, {
      method: "PATCH",
      headers: authHeaders(jean.token, orgAId),
      body: JSON.stringify({ unitPrice: "1" }),
    });
    expect(priceEditRes.status).toBe(404);

    const controlsRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}/versions/${extracted.version.id}/controls`, { headers: authHeaders(jean.token, orgAId) });
    expect(controlsRes.status).toBe(404);
  });

  it("BLOCKING — access revoked mid-session immediately blocks read/edit, even for the actor who created it", async () => {
    const client = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const bpu = await importBpuDocument({ tenderId: client.tenderId, token: tokenOwnerA, organizationId: orgAId });

    const worker = await registerAndLogin(`chiffrage-worker-${randomUUID()}@smoke.test`);
    userIds.push(worker.userId);
    await addMembership({ organizationId: orgAId, userId: worker.userId, role: OrganizationRole.Contributor });
    await assignClient({ organizationId: orgAId, clientAccountId: client.clientAccountId, userId: worker.userId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${client.tenderId}/pricing-schedules`, {
      method: "POST",
      headers: authHeaders(worker.token, orgAId),
      body: JSON.stringify({ sourceDocumentId: bpu.documentId }),
    });
    expect(createRes.status).toBe(201);
    const schedule = (await createRes.json()) as { id: string };

    // Révocation de l'accès client de `worker` — même motif que Sprint 12 (jamais un accès hérité
    // d'une vérification passée, revérifié À CHAQUE requête).
    await prisma.clientAssignment.deleteMany({ where: { organizationId: orgAId, clientAccountId: client.clientAccountId, userId: worker.userId } });

    const getRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}`, { headers: authHeaders(worker.token, orgAId) });
    expect(getRes.status).toBe(404);

    const extractRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}/extract`, {
      method: "POST",
      headers: authHeaders(worker.token, orgAId),
      body: JSON.stringify({ sourceDocumentVersionId: bpu.currentVersionId }),
    });
    expect(extractRes.status).toBe(404);

    // Même le CRÉATEUR original ne doit plus rien voir une fois révoqué (`createdBy` ne
    // contourne jamais la vérification).
    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${client.tenderId}/pricing-schedules`, { headers: authHeaders(worker.token, orgAId) });
    expect(listRes.status).toBe(404);
  });

  it("BLOCKING — a DIFFERENT organization never sees a pricing schedule, even by guessing its exact UUID (cross-org anti-IDOR)", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const bpu = await importBpuDocument({ tenderId, token: tokenOwnerA, organizationId: orgAId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing-schedules`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ sourceDocumentId: bpu.documentId }),
    });
    const schedule = (await createRes.json()) as { id: string };

    const crossOrgListRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing-schedules`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(crossOrgListRes.status).toBe(404);

    const crossOrgGetRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(crossOrgGetRes.status).toBe(404);
  });

  it("a pricing schedule created for lotId=X is rejected if that lot does not belong to the Tender (anti-IDOR on lotId)", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const bpu = await importBpuDocument({ tenderId, token: tokenOwnerA, organizationId: orgAId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing-schedules`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ sourceDocumentId: bpu.documentId, lotId: randomUUID() }),
    });
    expect(createRes.status).toBe(404);
  });

  it("rejects sourceDocumentId not present in this tender's DCE (anti-IDOR on sourceDocumentId)", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing-schedules`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ sourceDocumentId: randomUUID() }),
    });
    expect(createRes.status).toBe(404);
  });

  it("refuses a duplicate pricing schedule for the same (tender, lot, client, source document)", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const bpu = await importBpuDocument({ tenderId, token: tokenOwnerA, organizationId: orgAId });
    const first = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing-schedules`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ sourceDocumentId: bpu.documentId }),
    });
    expect(first.status).toBe(201);
    const second = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing-schedules`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ sourceDocumentId: bpu.documentId }),
    });
    expect(second.status).toBe(409);
  });

  /** TENDEROS-2.1-P2.2-E1 (correctif audit baseline P1, mission §12/§36/§37) — deux entreprises
   *  candidates RÉELLEMENT distinctes ("CLIENT COMMERCIAL X" ≠ "CANDIDAT A"/"CANDIDAT B", mission
   *  §15 "ne jamais utiliser des fixtures où Client et Candidate ont le même nom") peuvent chacune
   *  avoir leur propre chiffrage pour le MÊME (Tender, fichier source) sans être bloquées comme un
   *  faux doublon — la duplicate-detection est désormais scopée par `candidateCompanyId`, jamais par
   *  `clientAccountId` (toujours identique pour les deux, donc jamais réellement discriminant).
   *  Preuve directe (mission §36) que `CreatePricingScheduleUseCase` résout `candidateCompanyId`
   *  depuis `Tender.candidateCompanyId`, jamais depuis le ClientAccount commercial. */
  it("TEST 12 — multi-candidate: two distinct CandidateCompany can each hold their own pricing schedule for the same Tender/source document, never a false duplicate", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const bpu = await importBpuDocument({ tenderId, token: tokenOwnerA, organizationId: orgAId });

    const candidateA = await prisma.candidateCompany.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "CANDIDAT A", nameNormalized: "candidat a", status: "ACTIVE", createdBy: ownerAUserId },
    });
    await prisma.tender.update({ where: { id: tenderId }, data: { candidateCompanyId: candidateA.id } });

    const createdForA = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing-schedules`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ sourceDocumentId: bpu.documentId }),
    });
    expect(createdForA.status).toBe(201);
    const scheduleA = (await createdForA.json()) as { id: string; candidateCompanyId?: string };

    const candidateB = await prisma.candidateCompany.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "CANDIDAT B", nameNormalized: "candidat b", status: "ACTIVE", createdBy: ownerAUserId },
    });
    await prisma.tender.update({ where: { id: tenderId }, data: { candidateCompanyId: candidateB.id } });

    // AVANT ce checkpoint, cette requête aurait échoué en 409 (doublon) : les deux chiffrages
    // partagent le même Tender/ClientAccount, seule leur CandidateCompany diffère.
    const createdForB = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing-schedules`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ sourceDocumentId: bpu.documentId }),
    });
    expect(createdForB.status).toBe(201);
    const scheduleB = (await createdForB.json()) as { id: string; candidateCompanyId?: string };

    expect(scheduleA.id).not.toBe(scheduleB.id);

    const persistedA = await prisma.pricingSchedule.findUniqueOrThrow({ where: { id: scheduleA.id } });
    const persistedB = await prisma.pricingSchedule.findUniqueOrThrow({ where: { id: scheduleB.id } });
    expect(persistedA.candidateCompanyId).toBe(candidateA.id);
    expect(persistedB.candidateCompanyId).toBe(candidateB.id);
  });

  it("refuses generating a financial file before the version is validated", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const bpu = await importBpuDocument({ tenderId, token: tokenOwnerA, organizationId: orgAId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing-schedules`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ sourceDocumentId: bpu.documentId }),
    });
    const schedule = (await createRes.json()) as { id: string };
    const extractRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}/extract`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ sourceDocumentVersionId: bpu.currentVersionId }),
    });
    const extracted = (await extractRes.json()) as { version: { id: string } };

    const generateRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}/versions/${extracted.version.id}/generate`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({}),
    });
    expect(generateRes.status).toBe(409);
  });

  it("a VIEWER-tier client role (ReadPricingSchedule only) can read but is forbidden from creating a pricing schedule (ManagePricingSchedule required)", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const bpu = await importBpuDocument({ tenderId, token: tokenOwnerA, organizationId: orgAId });
    const viewer = await registerAndLogin(`chiffrage-viewer-${randomUUID()}@smoke.test`);
    userIds.push(viewer.userId);
    await addMembership({ organizationId: orgAId, userId: viewer.userId, role: OrganizationRole.Contributor });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: viewer.userId, role: "VIEWER", createdBy: ownerAUserId });

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing-schedules`, { headers: authHeaders(viewer.token, orgAId) });
    expect(listRes.status).toBe(200);

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing-schedules`, {
      method: "POST",
      headers: authHeaders(viewer.token, orgAId),
      body: JSON.stringify({ sourceDocumentId: bpu.documentId }),
    });
    expect(createRes.status).toBe(403);
  });

  describe("Checkpoint TENDEROS-2.1-P2.3-E1.4, mission §4 (CAS PRODUIT OBLIGATOIRE) — un DCE historique n'est jamais une preuve d'entitlement actuel", () => {
    // Réutilise délibérément orgB (déjà enregistrée dans le `beforeAll` racine, ENTERPRISE ACTIF)
    // plutôt qu'un nouveau `registerAndLogin` — ce fichier en effectue déjà plusieurs (main flow,
    // mass-assignment, cross-client, access-revoked, viewer-tier...), et `AuthThrottlerGuard`
    // partage un seul bucket 10/60s register+login (leçon déjà documentée cette session : au-delà
    // d'un certain nombre d'inscriptions dans le MÊME fichier, un enregistrement supplémentaire peut
    // essuyer un vrai 429, jamais une régression réelle). Ce describe block est le DERNIER du
    // fichier (ordre d'exécution vitest = ordre de déclaration au sein d'un fichier, jamais
    // parallèle) : aucun autre test n'utilise plus orgB après celui-ci, donc faire passer son
    // abonnement en PAST_DUE ici est sans risque pour le reste de la suite.

    it("T0 entitled -> T1 DCE imported -> T2 entitlement disappears -> T3 direct Pricing Schedule calls all refuse 402, no mutation ever persisted", async () => {
      // `createClientAndTender` n'appelle que `prisma` directement (jamais HTTP) — `userId` n'est
      // que la valeur `createdBy` des lignes créées, réutilise `ownerAUserId` déjà enregistré (le
      // Tender appartient à orgB, mais `createdBy` reste une simple référence informative, jamais
      // vérifiée pour l'appartenance organisationnelle) : ZÉRO `registerAndLogin` supplémentaire.
      const { tenderId } = await createClientAndTender({ organizationId: orgBId, userId: ownerAUserId });

      // T1 — DCE importé avec succès pendant que l'organisation est ENCORE entitled (abonnement
      // ENTERPRISE actif, déjà en place depuis le `beforeAll` racine) — gate DCE (E1.1) satisfait
      // via la branche abonnement, jamais un Pass.
      const bpu = await importBpuDocument({ tenderId, token: tokenOwnerB, organizationId: orgBId });

      // Toujours entitled : crée un chiffrage, extrait une version, fixe un prix — sert de PREUVE
      // que "un DCE existe déjà" n'est PAS pourquoi ces mutations réussissent ici (l'abonnement est
      // ENCORE actif à cet instant précis, réévalué à chaque appel).
      const createWhileEntitledRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing-schedules`, {
        method: "POST",
        headers: authHeaders(tokenOwnerB, orgBId),
        body: JSON.stringify({ sourceDocumentId: bpu.documentId }),
      });
      expect(createWhileEntitledRes.status).toBe(201);
      const schedule = (await createWhileEntitledRes.json()) as { id: string };

      const extractWhileEntitledRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}/extract`, {
        method: "POST",
        headers: authHeaders(tokenOwnerB, orgBId),
        body: JSON.stringify({ sourceDocumentVersionId: bpu.currentVersionId }),
      });
      expect(extractWhileEntitledRes.status).toBe(201);
      const extracted = (await extractWhileEntitledRes.json()) as { version: { id: string }; lines: { id: string; kind: string }[] };
      const priceableLine = extracted.lines.find((l) => l.kind === "PRICE_ITEM")!;

      const priceCountBefore = await prisma.pricingScheduleLine.count({ where: { organizationId: orgBId, proposedUnitPrice: { not: null } } });
      const scheduleCountBefore = await prisma.pricingSchedule.count({ where: { organizationId: orgBId } });
      const finalFileCountBefore = await prisma.pricingScheduleFinalFile.count({ where: { organizationId: orgBId } });

      // T2 — l'entitlement disparaît (abonnement passe PAST_DUE, plus aucune couverture — jamais un
      // Pass non plus, cette organisation n'en a jamais eu).
      await prisma.organizationSubscription.update({ where: { organizationId: orgBId }, data: { status: "PAST_DUE" } });

      // T3 — appels HTTP directs, chacun DOIT refuser 402 TENDER_OPERATION_NOT_ENTITLED, sans AUCUNE
      // mutation persistée — jamais "un DCE existe déjà" traité comme une preuve d'entitlement actuel.
      const createAfterLapseRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing-schedules`, {
        method: "POST",
        headers: authHeaders(tokenOwnerB, orgBId),
        body: JSON.stringify({ sourceDocumentId: bpu.documentId, financialDocumentTypeOverride: "DQE" }),
      });
      expect(createAfterLapseRes.status).toBe(402);
      const createAfterLapseBody = (await createAfterLapseRes.json()) as { error: { code: string } };
      expect(createAfterLapseBody.error.code).toBe("TENDER_OPERATION_NOT_ENTITLED");

      const editAfterLapseRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}/lines/${priceableLine.id}/price`, {
        method: "PATCH",
        headers: authHeaders(tokenOwnerB, orgBId),
        body: JSON.stringify({ unitPrice: "999.99" }),
      });
      expect(editAfterLapseRes.status).toBe(402);

      const validateAfterLapseRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}/versions/${extracted.version.id}/validate`, {
        method: "POST",
        headers: authHeaders(tokenOwnerB, orgBId),
        body: JSON.stringify({}),
      });
      expect(validateAfterLapseRes.status).toBe(402);

      const generateAfterLapseRes = await fetch(`${baseUrl}/api/v1/pricing-schedules/${schedule.id}/versions/${extracted.version.id}/generate`, {
        method: "POST",
        headers: authHeaders(tokenOwnerB, orgBId),
        body: JSON.stringify({}),
      });
      expect(generateAfterLapseRes.status).toBe(402);

      // Preuve DB directe — AUCUNE des 4 tentatives n'a laissé la moindre trace.
      expect(await prisma.pricingSchedule.count({ where: { organizationId: orgBId } })).toBe(scheduleCountBefore);
      expect(await prisma.pricingScheduleLine.count({ where: { organizationId: orgBId, proposedUnitPrice: { not: null } } })).toBe(priceCountBefore);
      const untouchedLine = await prisma.pricingScheduleLine.findUniqueOrThrow({ where: { id: priceableLine.id } });
      expect(untouchedLine.proposedUnitPrice?.toString()).not.toBe("999.99");
      const untouchedVersion = await prisma.pricingScheduleVersion.findUniqueOrThrow({ where: { id: extracted.version.id } });
      expect(untouchedVersion.status).not.toBe("VALIDATED");
      expect(await prisma.pricingScheduleFinalFile.count({ where: { organizationId: orgBId } })).toBe(finalFileCountBefore);
    });
  });
});
