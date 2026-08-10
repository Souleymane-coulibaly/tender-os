import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { buildMemoTemplateFixture } from "../../test-support/build-memo-fixture";

/**
 * V2 Sprint 12 (Mémoire technique IA) — preuve réelle contre HTTP + PostgreSQL (NestJS), même
 * motif que `chat-http.integration.spec.ts` (Sprint 9) : flux principal (Parcours B, "générer sans
 * modèle" — aucun upload multipart nécessaire, garde le test simple), et surtout deux tests
 * BLOQUANTS explicitement requis par la mission (§77/§81) : same-org cross-client, et anti-IDOR
 * cross-org sur l'API technical-memo. La génération IA elle-même (appel réseau réel) n'est
 * volontairement PAS exercée ici — même motif que Chat : aucune dépendance à une clé API dans cette
 * suite, la logique de génération/validation de citations est déjà couverte par les tests unitaires
 * dédiés (`technical-memo-citation-validator.spec.ts`, `map-findings-to-sections.spec.ts`).
 */
describe("Mémoire technique IA — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenOwnerB: string;
  let ownerAUserId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Technical Memo HTTP Test" }),
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
      data: { id: randomUUID(), organizationId: input.organizationId, name: `Client Memoire ${suffix}`, nameNormalized: `client memoire ${suffix}`, status: "ACTIVE", createdBy: input.userId },
    });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: input.organizationId, clientAccountId: clientAccount.id, title: "Marche Memoire HTTP", status: "IN_ANALYSIS", tags: [], createdBy: input.userId },
    });
    return { clientAccountId: clientAccount.id, tenderId: tender.id };
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

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Memoire Org A HTTP", slug: `memoire-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Memoire Org B HTTP", slug: `memoire-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`memoire-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`memoire-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId);
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;
    ownerAUserId = ownerA.userId;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });
  }, 60000);

  afterAll(async () => {
    await prisma.technicalMemoSectionCitation.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.technicalMemoSectionRequirement.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.technicalMemoSectionRevision.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.technicalMemoSection.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.technicalMemo.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    // Les tests multipart (COMPANY_TEMPLATE/DCE_REQUIRED_TEMPLATE) stockent un Document réel
    // (l'original immuable, mission §7) — jamais laissé orphelin avant la suppression des
    // organisations (contrainte FK `documents_organization_id_fkey`).
    await prisma.documentVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.document.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  it("main flow (Parcours B, sans modèle): create → get → list, scoped to its own Tender/client", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/technical-memos`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ templateOrigin: "TENDEROS_SYSTEM" }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { memo: { id: string; tenderId: string; clientAccountId: string; status: string }; sections: { id: string; title: string }[] };
    expect(created.memo.tenderId).toBe(tenderId);
    expect(created.memo.clientAccountId).toBe(clientAccountId);
    expect(created.memo.status).toBe("DRAFT");
    // Mission §20 — 12 sections standard, structure réelle jamais inventée à la volée.
    expect(created.sections.length).toBe(12);

    const getRes = await fetch(`${baseUrl}/api/v1/technical-memos/${created.memo.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(getRes.status).toBe(200);
    const fetched = (await getRes.json()) as { memo: { id: string }; sections: unknown[] };
    expect(fetched.memo.id).toBe(created.memo.id);
    expect(fetched.sections.length).toBe(12);

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/technical-memos`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as { id: string }[];
    expect(listed.map((m) => m.id)).toContain(created.memo.id);

    // Mission §7 — un seul mémoire par (Tender, lot) : une seconde création sur le même Tender
    // (sans lot) doit être refusée.
    const duplicateRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/technical-memos`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ templateOrigin: "TENDEROS_SYSTEM" }),
    });
    expect(duplicateRes.status).toBe(409);

    const coverageRes = await fetch(`${baseUrl}/api/v1/technical-memos/${created.memo.id}/coverage`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(coverageRes.status).toBe(200);
    expect((await coverageRes.json()) as { totalRequirements: number }).toMatchObject({ totalRequirements: 0 });
  });

  it("mass assignment — organizationId/clientAccountId/tenderId are always server-resolved, never accepted from the client body", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const foreignOrg = await createClientAndTender({ organizationId: orgBId, userId: (await registerAndLogin(`memoire-foreign-${randomUUID()}@smoke.test`)).userId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/technical-memos`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({
        templateOrigin: "TENDEROS_SYSTEM",
        organizationId: orgBId,
        clientAccountId: randomUUID(),
        tenderId: foreignOrg.tenderId,
        status: "EXPORTED",
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { memo: { organizationId: string; tenderId: string; status: string } };
    expect(created.memo.organizationId).toBe(orgAId);
    expect(created.memo.tenderId).toBe(tenderId);
    expect(created.memo.status).toBe("DRAFT");
  });

  it("BLOCKING — never leaks a technical memo of a DIFFERENT client of the SAME organization, even for an actor with a real (but unrelated) client assignment", async () => {
    const clientA = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const clientB = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });

    const jean = await registerAndLogin(`memoire-jean-${randomUUID()}@smoke.test`);
    userIds.push(jean.userId);
    await addMembership({ organizationId: orgAId, userId: jean.userId, role: OrganizationRole.Contributor });
    // Jean n'a d'accès QU'au Client B — jamais au Client A.
    await assignClient({ organizationId: orgAId, clientAccountId: clientB.clientAccountId, userId: jean.userId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/technical-memos`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ templateOrigin: "TENDEROS_SYSTEM" }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { memo: { id: string } };

    // Jean, same-org mais SANS accès à ce client précis, ne doit RIEN voir de ce Tender via le
    // mémoire technique — ni la liste, ni le mémoire directement par son id (anti-IDOR).
    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/technical-memos`, { headers: authHeaders(jean.token, orgAId) });
    expect(listRes.status).toBe(404);

    const getRes = await fetch(`${baseUrl}/api/v1/technical-memos/${created.memo.id}`, { headers: authHeaders(jean.token, orgAId) });
    expect(getRes.status).toBe(404);

    const createByJeanRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/technical-memos`, {
      method: "POST",
      headers: authHeaders(jean.token, orgAId),
      body: JSON.stringify({ templateOrigin: "TENDEROS_SYSTEM" }),
    });
    expect(createByJeanRes.status).toBe(404);
  });

  it("BLOCKING — a DIFFERENT organization never sees a technical memo, even by guessing its exact UUID (cross-org anti-IDOR)", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/technical-memos`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ templateOrigin: "TENDEROS_SYSTEM" }),
    });
    const created = (await createRes.json()) as { memo: { id: string } };

    const crossOrgListRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/technical-memos`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(crossOrgListRes.status).toBe(404);

    const crossOrgGetRes = await fetch(`${baseUrl}/api/v1/technical-memos/${created.memo.id}`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(crossOrgGetRes.status).toBe(404);
  });

  it("a technical memo created for lotId=X is rejected if that lot does not belong to the Tender (anti-IDOR on lotId)", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/technical-memos`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ templateOrigin: "TENDEROS_SYSTEM", lotId: randomUUID() }),
    });
    expect(createRes.status).toBe(404);
  });

  it("a VIEWER-tier client role (ReadTechnicalMemo only) can read but is forbidden from creating a technical memo (ManageTechnicalMemo required)", async () => {
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const viewer = await registerAndLogin(`memoire-viewer-${randomUUID()}@smoke.test`);
    userIds.push(viewer.userId);
    await addMembership({ organizationId: orgAId, userId: viewer.userId, role: OrganizationRole.Contributor });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: viewer.userId, role: "VIEWER", createdBy: ownerAUserId });

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/technical-memos`, { headers: authHeaders(viewer.token, orgAId) });
    expect(listRes.status).toBe(200);

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/technical-memos`, {
      method: "POST",
      headers: authHeaders(viewer.token, orgAId),
      body: JSON.stringify({ templateOrigin: "TENDEROS_SYSTEM" }),
    });
    expect(createRes.status).toBe(403);
  });

  /** Réserve (audit Codex, round GO-avec-réserves) — les tests précédents couvraient uniquement le
   *  parcours TENDEROS_SYSTEM (aucun upload) ; celui-ci exerce le VRAI chemin multipart pour les
   *  DEUX origines "avec modèle" (mission §7 : COMPANY_TEMPLATE / DCE_REQUIRED_TEMPLATE), preuve
   *  réelle que l'upload + l'analyse structurelle synchrone fonctionnent bout en bout contre
   *  PostgreSQL, pas seulement en test unitaire (`docx-outline-extractor.spec.ts`). */
  it.each(["COMPANY_TEMPLATE", "DCE_REQUIRED_TEMPLATE"] as const)(
    "creates a technical memo from a real uploaded .docx via multipart (%s) — analyzes the real structure, immutable original stored",
    async (templateOrigin) => {
      const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
      const fixtureBuffer = await buildMemoTemplateFixture();

      const body = new FormData();
      body.set("templateOrigin", templateOrigin);
      body.set("file", new Blob([fixtureBuffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "modele.docx");

      const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/technical-memos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenOwnerA}`, "X-Organization-Id": orgAId },
        body,
      });
      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as { memo: { templateOrigin: string; originalDocumentId?: string; originalDocumentVersionId?: string }; sections: { title: string; level: number }[] };

      expect(created.memo.templateOrigin).toBe(templateOrigin);
      expect(created.memo.originalDocumentId).toBeTruthy();
      expect(created.memo.originalDocumentVersionId).toBeTruthy();
      // La fixture réelle (build-memo-fixture.ts) contient exactement 7 titres détectables — jamais
      // une structure inventée, jamais réordonnée (mission §13, même pour la trame DCE imposée :
      // aucun chemin de code séparé n'existe pour "améliorer" sa structure).
      expect(created.sections).toHaveLength(7);
      expect(created.sections.map((s) => s.title)).toEqual([
        "1. Présentation de l'entreprise",
        "2. Compréhension du besoin",
        "2.1 Contexte",
        "2.2 Enjeux",
        "3. Méthodologie",
        "4. Moyens humains",
        "5. Références",
      ]);
    },
  );
});
