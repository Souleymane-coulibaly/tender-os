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
      body: JSON.stringify({ email, password, displayName: "Technical Memo HTTP Test", termsAccepted: true }),
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

  // Checkpoint 2.1-P2.1-FIX-D — même motif que `opportunity-http.integration.spec.ts`
  // (`seedSucceededAnalysis`) : un `Dce`/une `TenderAnalysisSummary` réels, `analysisVersion`/
  // `dceRevision` paramétrables pour piloter les scénarios de dérive DCE/réanalyse de l'E2E ci-dessous.
  async function ensureDce(input: { organizationId: string; tenderId: string; actorId: string }): Promise<string> {
    const existing = await prisma.dce.findUnique({ where: { tenderId: input.tenderId } });
    if (existing) return existing.id;
    const created = await prisma.dce.create({
      data: { id: randomUUID(), organizationId: input.organizationId, tenderId: input.tenderId, status: "IMPORTED", revision: 1, createdByUserId: input.actorId },
    });
    return created.id;
  }

  async function seedSucceededAnalysis(input: {
    organizationId: string;
    tenderId: string;
    actorId: string;
    analysisVersion: number;
    dceRevision: number;
  }): Promise<{ dceId: string; analysisJobId: string }> {
    const dceId = await ensureDce({ organizationId: input.organizationId, tenderId: input.tenderId, actorId: input.actorId });
    const jobId = randomUUID();
    await prisma.analysisJob.create({
      data: {
        id: jobId,
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        targetId: input.tenderId,
        scope: "TENDER",
        status: "SUCCEEDED",
        analysisVersion: input.analysisVersion,
        promptVersion: 1,
        triggeredByRole: "OWNER",
        updatedAt: new Date(),
      },
    });
    await prisma.tenderAnalysisSummary.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        analysisJobId: jobId,
        analysisVersion: input.analysisVersion,
        dceRevision: input.dceRevision,
        opportunitySummary: "Marché de nettoyage de bureaux, DCE complet.",
        complexityLevel: "MEDIUM",
        goNoGoRecommendation: "GO",
        goNoGoRationale: "Dossier complet, aucun signal bloquant détecté.",
      },
    });
    return { dceId, analysisJobId: jobId };
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
    // Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 1 — CreateTechnicalMemoUseCase/
    // GenerateTechnicalMemoSectionUseCase gatent désormais canOperateOnTender : ENTERPRISE
    // (illimité) évite tout effet de bord de quota/AO credits.
    await prisma.organizationSubscription.createMany({
      data: [
        { id: randomUUID(), organizationId: orgAId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
        { id: randomUUID(), organizationId: orgBId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
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
    // Le test E2E (Checkpoint 2.1-P2.1-FIX-D) exerce `/prepare` (gabarit dérivé TENDEROS_SYSTEM) et
    // `/export` — `DocumentTemplate`/`GeneratedDocument` n'ont aucune FK Prisma déclarée vers
    // Organization/Tender pour la première, cascade réelle depuis Tender pour la seconde ; nettoyage
    // explicite pour ne jamais laisser d'orphelines, même motif que Document/DocumentVersion plus bas.
    await prisma.generatedDocumentRevision.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.generatedDocument.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentTemplateVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentTemplate.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderRequirementFinding.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderAnalysisSummary.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.analysisJob.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.dce.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
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
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
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

  /**
   * Checkpoint 2.1-P2.1-FIX-D — E2E réaliste (mission §90), adapté à la contrainte déjà en tête de
   * fichier ("aucun appel IA réel dans cette suite") : les générations/régénérations de section ne
   * peuvent pas être obtenues via un VRAI appel IA ici — elles sont donc simulées par une écriture
   * directe de `TechnicalMemoSectionRevision` avec la provenance qu'une génération réussie aurait
   * capturée (même motif que `assertAnalysisPrecondition`/`finalize()` dans le use case réel), ce
   * qui permet de prouver EXACTEMENT ce que la mission demande sans dépendance à une clé API :
   *   1. DCE rev1 + Analyse v1 CURRENT, une exigence réelle liée à UNE section → mémoire CURRENT
   *      une fois toutes les sections "générées".
   *   2. RC-v2 (bump `Dce.revision`, aucune réanalyse encore) → la section dépendante devient STALE,
   *      jamais silencieusement CURRENT (mission §9-10) ; le mémoire global devient STALE.
   *   3. Une régénération de la section dépendante est BLOQUÉE (409, gate AVANT tout appel IA — donc
   *      testable via un VRAI appel HTTP même sans provider IA configuré) tant que l'analyse n'est
   *      pas CURRENT.
   *   4. Un export est REFUSÉ (409) tant que le mémoire est STALE — jamais un DOCX final produit à
   *      partir d'un contenu obsolète (mission §49/§110).
   *   5. Réanalyse (v2, dceRevision=2) puis régénération réelle de la SEULE section dépendante → le
   *      mémoire redevient CURRENT, l'ANCIENNE révision reste interrogeable (jamais supprimée,
   *      mission §23/§51), et l'export réussit de nouveau.
   */
  it("E2E (mission §90) — DCE/analyse change makes an already-generated section STALE, blocks regeneration and export until reanalysis, then CURRENT again after real regeneration (old revision preserved)", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });

    const { dceId, analysisJobId: analysisJobV1 } = await seedSucceededAnalysis({ organizationId: orgAId, tenderId, actorId: ownerAUserId, analysisVersion: 1, dceRevision: 1 });
    const findingId = randomUUID();
    await prisma.tenderRequirementFinding.create({
      data: {
        id: findingId,
        organizationId: orgAId,
        tenderId,
        analysisJobId: analysisJobV1,
        analysisVersion: 1,
        category: "ADMINISTRATIVE",
        label: "Fournir une attestation d'assurance décennale",
        isMandatory: true,
      },
    });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/technical-memos`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ templateOrigin: "TENDEROS_SYSTEM" }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { memo: { id: string }; sections: { id: string }[] };
    const memoId = created.memo.id;
    const dependentSectionId = created.sections[0]!.id;

    // Prépare le gabarit dérivé (nécessaire pour que `/export` dépasse la garde
    // `TechnicalMemoTemplateNotReadyError` — jamais atteinte autrement, indépendante de ce checkpoint).
    const prepareRes = await fetch(`${baseUrl}/api/v1/technical-memos/${memoId}/prepare`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(prepareRes.status).toBe(200);

    // Lie directement UNE section à l'exigence DCE — contourne volontairement l'heuristique de
    // `/map` (hors périmètre de ce test, déjà couverte par `map-findings-to-sections.spec.ts`).
    await prisma.technicalMemoSectionRequirement.create({
      data: { id: randomUUID(), organizationId: orgAId, technicalMemoSectionId: dependentSectionId, findingType: "REQUIREMENT", findingId, coverageStatus: "NEEDS_REVIEW" },
    });

    // Étape 1a — aucune section générée : UNKNOWN, jamais faussement CURRENT pour un mémoire vide
    // (mission §29).
    const freshnessEmptyRes = await fetch(`${baseUrl}/api/v1/technical-memos/${memoId}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(freshnessEmptyRes.status).toBe(200);
    expect((await freshnessEmptyRes.json()) as { freshness: string }).toMatchObject({ freshness: "UNKNOWN" });

    // Étape 1b — simule une génération réussie pour CHAQUE section : la section dépendante capture
    // analysisVersion=1/dceRevision=1, les autres n'ont AUCUNE dépendance DCE (mission "jamais une
    // dépendance fabriquée" — seule la section réellement liée à une exigence porte une provenance
    // DCE).
    for (const section of created.sections) {
      const isDependent = section.id === dependentSectionId;
      await prisma.technicalMemoSectionRevision.create({
        data: {
          id: randomUUID(),
          organizationId: orgAId,
          technicalMemoSectionId: section.id,
          revisionNumber: 1,
          source: "AI_GENERATED",
          content: `Contenu généré pour ${section.id}.`,
          analysisVersion: isDependent ? 1 : null,
          dceRevision: isDependent ? 1 : null,
          createdBy: ownerAUserId,
        },
      });
    }

    const freshnessCurrentRes = await fetch(`${baseUrl}/api/v1/technical-memos/${memoId}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await freshnessCurrentRes.json()) as { freshness: string }).toMatchObject({ freshness: "CURRENT" });

    // Étape 1c — un mémoire globalement CURRENT reste exportable normalement (pas encore de garde
    // bloquante) : preuve que la garde §49/§110 n'introduit jamais un faux positif.
    const exportCurrentRes = await fetch(`${baseUrl}/api/v1/technical-memos/${memoId}/export`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(exportCurrentRes.status).toBe(200);

    // Étape 1d (correctif audit FIXD-P1-001) — un humain édite MANUELLEMENT la section dépendante
    // du DCE via le VRAI endpoint HTTP `/edit`. La nouvelle révision MANUAL doit CONSERVER
    // analysisVersion=1/dceRevision=1 (jamais les effacer) : sinon `computeTechnicalMemoSectionFreshness`
    // traiterait cette section comme "sans dépendance DCE" et elle resterait faussement CURRENT
    // pour toujours, même après un futur changement DCE (voir l'assertion après la RC-v2 ci-dessous).
    const editRes = await fetch(`${baseUrl}/api/v1/technical-memos/${memoId}/sections/${dependentSectionId}/edit`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ content: "Contenu corrigé à la main par un utilisateur, sur la base du texte généré par l'IA." }),
    });
    expect(editRes.status).toBe(200);
    expect((await editRes.json()) as { source: string; analysisVersion?: number; dceRevision?: number }).toMatchObject({ source: "MANUAL", analysisVersion: 1, dceRevision: 1 });

    const freshnessAfterEditRes = await fetch(`${baseUrl}/api/v1/technical-memos/${memoId}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await freshnessAfterEditRes.json()) as { freshness: string }).toMatchObject({ freshness: "CURRENT" });

    // Étape 2 — RC-v2 : le DCE change (nouvelle révision), AUCUNE réanalyse encore. L'analyse v1
    // devient elle-même STALE (dceRevision=1 ≠ Dce.revision=2), donc la section qui en dépend
    // devient STALE — jamais un faux CURRENT global (mission §9-10/§39).
    await prisma.dce.update({ where: { id: dceId }, data: { revision: 2 } });

    const freshnessStaleRes = await fetch(`${baseUrl}/api/v1/technical-memos/${memoId}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const freshnessStale = (await freshnessStaleRes.json()) as { freshness: string; sections: { technicalMemoSectionId: string; freshness: string; analysisStale?: boolean }[] };
    expect(freshnessStale.freshness).toBe("STALE");
    expect(freshnessStale.sections.find((s) => s.technicalMemoSectionId === dependentSectionId)).toMatchObject({ freshness: "STALE", analysisStale: true });
    // Les sections indépendantes du DCE restent CURRENT — la staleness ne se propage jamais à une
    // section qui ne consomme réellement aucune source DCE (mission "jamais une dépendance
    // fabriquée").
    expect(freshnessStale.sections.filter((s) => s.technicalMemoSectionId !== dependentSectionId).every((s) => s.freshness === "CURRENT")).toBe(true);

    // Étape 3 — une régénération de la section dépendante est bloquée AVANT tout appel IA (le garde
    // `assertAnalysisPrecondition` s'exécute avant `beginGeneration()`), donc testable via un VRAI
    // appel HTTP sans provider IA configuré dans cette suite.
    const blockedGenerateRes = await fetch(`${baseUrl}/api/v1/technical-memos/${memoId}/sections/${dependentSectionId}/generate`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({}),
    });
    expect(blockedGenerateRes.status).toBe(409);
    expect((await blockedGenerateRes.json()) as { error: { code: string } }).toMatchObject({ error: { code: "TECHNICAL_MEMO_ANALYSIS_NOT_CURRENT" } });

    // Étape 4 — un mémoire STALE n'est JAMAIS exportable comme version courante (mission §49/§110).
    const blockedExportRes = await fetch(`${baseUrl}/api/v1/technical-memos/${memoId}/export`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(blockedExportRes.status).toBe(409);
    expect((await blockedExportRes.json()) as { error: { code: string } }).toMatchObject({ error: { code: "TECHNICAL_MEMO_STALE_EXPORT_BLOCKED" } });

    // Étape 5a — réanalyse (v2, dceRevision=2) : à elle seule, elle ne "répare" PAS rétroactivement
    // une section déjà générée — seule une régénération EXPLICITE de cette section peut le faire
    // (mission §21 "jamais automatique"). Le mémoire reste STALE tant que la section dépendante n'a
    // pas été régénérée, même si l'analyse courante est de nouveau CURRENT.
    await seedSucceededAnalysis({ organizationId: orgAId, tenderId, actorId: ownerAUserId, analysisVersion: 2, dceRevision: 2 });

    const freshnessStillStaleRes = await fetch(`${baseUrl}/api/v1/technical-memos/${memoId}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await freshnessStillStaleRes.json()) as { freshness: string }).toMatchObject({ freshness: "STALE" });

    // Étape 5b — régénération réelle (simulée, même motif qu'à l'étape 1b) de la SEULE section
    // dépendante contre l'analyse désormais CURRENT — nouvelle révision (3, après la 1=AI_GENERATED
    // et la 2=MANUAL de l'étape 1d), aucune des révisions PRÉCÉDENTES n'est JAMAIS supprimée ni
    // écrasée (mission §23/§51 "historique de versions, jamais un écrasement silencieux").
    await prisma.technicalMemoSectionRevision.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        technicalMemoSectionId: dependentSectionId,
        revisionNumber: 3,
        source: "AI_REGENERATED",
        content: `Contenu régénéré pour ${dependentSectionId}.`,
        analysisVersion: 2,
        dceRevision: 2,
        createdBy: ownerAUserId,
      },
    });

    const historicalRevisions = await prisma.technicalMemoSectionRevision.findMany({
      where: { organizationId: orgAId, technicalMemoSectionId: dependentSectionId },
      orderBy: { revisionNumber: "asc" },
    });
    expect(historicalRevisions).toHaveLength(3);
    expect(historicalRevisions[0]).toMatchObject({ revisionNumber: 1, source: "AI_GENERATED", analysisVersion: 1, dceRevision: 1 });
    // Correctif audit FIXD-P1-001 — la révision MANUAL de l'étape 1d (interrogeable et préservée)
    // porte bien la provenance DCE CONSERVÉE, jamais effacée.
    expect(historicalRevisions[1]).toMatchObject({ revisionNumber: 2, source: "MANUAL", analysisVersion: 1, dceRevision: 1 });
    expect(historicalRevisions[2]).toMatchObject({ revisionNumber: 3, source: "AI_REGENERATED", analysisVersion: 2, dceRevision: 2 });

    // Étape 5c — le mémoire redevient globalement CURRENT, et l'export réussit de nouveau.
    const freshnessCurrentAgainRes = await fetch(`${baseUrl}/api/v1/technical-memos/${memoId}/freshness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await freshnessCurrentAgainRes.json()) as { freshness: string }).toMatchObject({ freshness: "CURRENT" });

    const exportAgainRes = await fetch(`${baseUrl}/api/v1/technical-memos/${memoId}/export`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(exportAgainRes.status).toBe(200);
  }, 60000);
});
