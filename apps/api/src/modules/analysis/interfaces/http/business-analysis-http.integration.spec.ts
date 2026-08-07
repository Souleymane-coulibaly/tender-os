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
import { BUSINESS_ANALYSIS_REPOSITORY, type BusinessAnalysisRepository } from "../../application/ports/business-analysis.repository";
import type { TenderConsolidationOutput } from "../../application/schemas/business/tender-consolidation-output.schema";

/**
 * Preuve réelle contre HTTP + PostgreSQL pour les lectures métier Sprint 4.2 (GET .../analysis,
 * .../analyses, .../analysis/risks|criteria|deadlines|requirements|questions). Aucune clé IA n'est
 * configurée dans cet environnement de test (voir analysis-http.integration.spec.ts) : le résultat
 * métier consolidé est donc semé directement via `PrismaBusinessAnalysisRepository` (le VRAI
 * repository, pas un mock) plutôt qu'en attendant qu'un vrai provider IA réponde — même contournement
 * déterministe que les tests "double trigger"/"cancel" du fichier voisin, qui insèrent un
 * `AnalysisJob` directement plutôt que de dépendre du minutage du dispatcher in-process.
 */
describe("Analysis (business reads) — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let businessAnalysisRepository: BusinessAnalysisRepository;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenAdminA: string;
  let tokenReadOnlyA: string;
  let tokenAdminB: string;

  let tenderAId: string;
  let tenderWithoutAnalysisId: string;
  let tenderBId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Business Analysis HTTP Test" }),
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

  function tenderOutput(): TenderConsolidationOutput {
    return {
      metadata: { title: "Marché de nettoyage" },
      deadlines: [
        { kind: "SUBMISSION", label: "Remise des offres", date: "2026-09-01T12:00:00.000Z", isInferred: false, confidence: 0.9 },
        { kind: "QUESTIONS", label: "Date limite des questions", date: "2026-08-15T12:00:00.000Z", isInferred: false, confidence: 0.8 },
      ],
      criteria: [{ name: "Prix", weight: 60, isEliminatory: false, isInferred: false, confidence: 0.85 }],
      requirements: [{ category: "TECHNICAL_MEMO", label: "Mémoire technique", isMandatory: true, isInferred: false, confidence: 0.8 }],
      clauses: [{ category: "PENALTY", summary: "Pénalités de retard", isInferred: false, confidence: 0.7 }],
      risks: [
        {
          title: "Délai de réponse court",
          category: "PLANNING",
          severity: "HIGH",
          explanation: "Le délai entre publication et remise est court.",
          recommendation: "Prioriser la rédaction du mémoire technique.",
          isInferred: false,
          confidence: 0.75,
        },
      ],
      questions: [
        {
          question: "Le DPGF doit-il être remis au format Excel natif ?",
          justification: "Le CCAP ne précise pas le format attendu.",
          priority: "MEDIUM",
          theme: "Pièces à fournir",
          isInferred: false,
          confidence: 0.6,
        },
      ],
      summary: {
        opportunitySummary: "Marché de nettoyage, complexité modérée.",
        complexityLevel: "MEDIUM",
        mainCriteria: ["Prix (60%)"],
        mainRisks: ["Délai court"],
        mainObligations: ["Mémoire technique obligatoire"],
        missingElements: [],
        pointsToClarify: ["Format du DPGF"],
        conflicts: [],
        goNoGoRecommendation: "GO_WITH_RESERVATIONS",
        goNoGoRationale: "Cohérent avec le profil malgré un délai court.",
      },
    };
  }

  async function seedSucceededTenderAnalysis(tenderId: string, organizationId: string, analysisVersion: number): Promise<string> {
    const jobId = randomUUID();
    await prisma.analysisJob.create({
      data: {
        id: jobId,
        organizationId,
        tenderId,
        targetId: tenderId,
        scope: "TENDER",
        status: "SUCCEEDED",
        analysisVersion,
        promptVersion: 1,
        attemptCount: 1,
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await prisma.$transaction((tx) =>
      businessAnalysisRepository.persistTenderConsolidation(tx, {
        organizationId,
        analysisJobId: jobId,
        analysisVersion,
        tenderId,
        output: tenderOutput(),
        documentVersionsByDocumentId: {},
      }),
    );
    return jobId;
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
    businessAnalysisRepository = moduleRef.get(BUSINESS_ANALYSIS_REPOSITORY);

    await prisma.organization.create({
      data: { id: orgAId, name: "BizAnalysis Org A HTTP", slug: `bizanalysis-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
    await prisma.organization.create({
      data: { id: orgBId, name: "BizAnalysis Org B HTTP", slug: `bizanalysis-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });

    const adminA = await registerAndLogin(`bizanalysis-admin-a-${randomUUID()}@smoke.test`);
    const readOnlyA = await registerAndLogin(`bizanalysis-readonly-a-${randomUUID()}@smoke.test`);
    const adminB = await registerAndLogin(`bizanalysis-admin-b-${randomUUID()}@smoke.test`);
    userIds.push(adminA.userId, readOnlyA.userId, adminB.userId);
    tokenAdminA = adminA.token;
    tokenReadOnlyA = readOnlyA.token;
    tokenAdminB = adminB.token;

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

    // Mission Sprint 5.1 — READ_ONLY n'est ni OWNER ni ORGANIZATION_ADMIN : sans affectation
    // client explicite, GetTenderUseCase (client-aware) le refuserait désormais (404). Ce test
    // vérifie le palier de permission ANALYSIS (Read jamais Trigger), pas l'isolation client —
    // une affectation VIEWER sur le client du Tender A restaure son accès de lecture.
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientAccountA.id, userId: readOnlyA.userId, role: "VIEWER", createdBy: adminA.userId },
    });

    tenderAId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderAId, organizationId: orgAId, clientAccountId: clientAccountA.id, title: "Tender A — BizAnalysis HTTP", status: "DRAFT", tags: [], createdBy: adminA.userId },
    });
    tenderWithoutAnalysisId = randomUUID();
    await prisma.tender.create({
      data: {
        id: tenderWithoutAnalysisId,
        organizationId: orgAId,
        clientAccountId: clientAccountA.id,
        title: "Tender A (no analysis yet) — BizAnalysis HTTP",
        status: "DRAFT",
        tags: [],
        createdBy: adminA.userId,
      },
    });
    tenderBId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderBId, organizationId: orgBId, clientAccountId: clientAccountB.id, title: "Tender B — BizAnalysis HTTP", status: "DRAFT", tags: [], createdBy: adminB.userId },
    });

    await seedSucceededTenderAnalysis(tenderAId, orgAId, 1);
    await seedSucceededTenderAnalysis(tenderAId, orgAId, 2); // historise une seconde version, GET .../analysis doit résoudre la 2
  }, 60000);

  afterAll(async () => {
    await prisma.tenderAnalysisSummaryRevision.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderAnalysisSummary.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderQuestionFinding.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderRiskFinding.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderClauseFinding.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderRequirementFinding.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderCriterionFinding.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderDeadlineFinding.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.analysisJob.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
  }, 30000);

  it("GET /tenders/:tenderId/analysis returns the LATEST consolidated summary", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis`, { headers: authHeaders(tokenAdminA, orgAId) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { analysisVersion: number; goNoGoRecommendation: string };
    expect(body.analysisVersion).toBe(2);
    expect(body.goNoGoRecommendation).toBe("GO_WITH_RESERVATIONS");
  });

  it("GET /tenders/:tenderId/analysis returns 404 TENDER_BUSINESS_ANALYSIS_NOT_FOUND when nothing has ever succeeded", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderWithoutAnalysisId}/analysis`, { headers: authHeaders(tokenAdminA, orgAId) });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("TENDER_BUSINESS_ANALYSIS_NOT_FOUND");
  });

  it("GET /tenders/:tenderId/analyses returns the job history, most recent version first", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analyses`, { headers: authHeaders(tokenAdminA, orgAId) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { analysisVersion: number; status: string }[]; total: number };
    expect(body.total).toBe(2);
    expect(body.items[0]!.analysisVersion).toBe(2);
    expect(body.items[1]!.analysisVersion).toBe(1);
    expect(body.items[0]!.status).toBe("SUCCEEDED");
  });

  it("GET /tenders/:tenderId/analysis/risks resolves the latest version by default and returns the risk finding", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis/risks`, { headers: authHeaders(tokenAdminA, orgAId) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { severity: string }[]; total: number; analysisVersion: number };
    expect(body.total).toBe(1);
    expect(body.analysisVersion).toBe(2);
    expect(body.items[0]!.severity).toBe("HIGH");
  });

  it("GET /tenders/:tenderId/analysis/deadlines supports an explicit ?analysisVersion= to consult history", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis/deadlines?analysisVersion=1`, {
      headers: authHeaders(tokenAdminA, orgAId),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; total: number; analysisVersion: number };
    expect(body.analysisVersion).toBe(1);
    expect(body.total).toBe(2);
  });

  it("GET /tenders/:tenderId/analysis/criteria supports limit/offset pagination", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis/criteria?limit=1&offset=0`, {
      headers: authHeaders(tokenAdminA, orgAId),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; total: number; limit: number; offset: number };
    expect(body.items).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.limit).toBe(1);
  });

  it("GET /tenders/:tenderId/analysis/requirements and .../questions return the consolidated findings", async () => {
    const requirementsRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis/requirements`, { headers: authHeaders(tokenAdminA, orgAId) });
    expect(requirementsRes.status).toBe(200);
    expect(((await requirementsRes.json()) as { total: number }).total).toBe(1);

    const questionsRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis/questions`, { headers: authHeaders(tokenAdminA, orgAId) });
    expect(questionsRes.status).toBe(200);
    const questionsBody = (await questionsRes.json()) as { items: { theme: string }[]; total: number };
    expect(questionsBody.total).toBe(1);
    expect(questionsBody.items[0]!.theme).toBe("Pièces à fournir");
  });

  it("GET /tenders/:tenderId/analysis/clauses returns the consolidated clause findings", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis/clauses`, { headers: authHeaders(tokenAdminA, orgAId) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { category: string; summary: string }[]; total: number; analysisVersion: number };
    expect(body.total).toBe(1);
    expect(body.analysisVersion).toBe(2);
    expect(body.items[0]!.category).toBe("PENALTY");
    expect(body.items[0]!.summary).toBe("Pénalités de retard");
  });

  it("returns an empty page (never an error) for a tender with no analysis yet", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderWithoutAnalysisId}/analysis/risks`, { headers: authHeaders(tokenAdminA, orgAId) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; total: number; analysisVersion?: number };
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.analysisVersion).toBeUndefined();
  });

  it("lets a READ_ONLY actor read the business analysis (200) — Read permission, never Trigger", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis`, { headers: authHeaders(tokenReadOnlyA, orgAId) });
    expect(res.status).toBe(200);
  });

  it("never leaks another organization's tender business analysis (404 TENDER_NOT_FOUND, never the data)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis`, { headers: authHeaders(tokenAdminB, orgBId) });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("TENDER_NOT_FOUND");
  });

  it("rejects an unauthenticated request (401)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis`);
    expect(res.status).toBe(401);
  });

  it("POST .../analysis/revisions creates a revision without ever mutating the original AI summary", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis/revisions`, {
      method: "POST",
      headers: { ...authHeaders(tokenAdminA, orgAId), "Content-Type": "application/json" },
      body: JSON.stringify({ opportunitySummary: "Synthèse corrigée par le Bid Manager.", reason: "Le budget acheteur a été précisé depuis." }),
    });
    expect(res.status).toBe(201);
    const revision = (await res.json()) as { revisionNumber: number; opportunitySummary: string; complexityLevel?: string };
    expect(revision.revisionNumber).toBe(1);
    expect(revision.opportunitySummary).toBe("Synthèse corrigée par le Bid Manager.");
    expect(revision.complexityLevel).toBeUndefined();

    const original = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis`, { headers: authHeaders(tokenAdminA, orgAId) });
    const originalBody = (await original.json()) as { opportunitySummary: string };
    expect(originalBody.opportunitySummary).toBe("Marché de nettoyage, complexité modérée.");
  });

  it("GET .../analysis/revisions lists revisions most-recent-first, and is empty for an unrevised summary", async () => {
    const emptyRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderWithoutAnalysisId}/analysis/revisions`, { headers: authHeaders(tokenAdminA, orgAId) });
    expect(emptyRes.status).toBe(200);
    expect(await emptyRes.json()).toEqual([]);

    await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis/revisions`, {
      method: "POST",
      headers: { ...authHeaders(tokenAdminA, orgAId), "Content-Type": "application/json" },
      body: JSON.stringify({ pointsToClarify: ["Confirmer le format du DPGF"] }),
    });

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis/revisions`, { headers: authHeaders(tokenAdminA, orgAId) });
    expect(res.status).toBe(200);
    const revisions = (await res.json()) as { revisionNumber: number }[];
    expect(revisions.length).toBeGreaterThanOrEqual(1);
    expect(revisions[0]!.revisionNumber).toBe(Math.max(...revisions.map((r) => r.revisionNumber)));
  });

  it("refuses an empty revision body (400, at least one field must be corrected)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis/revisions`, {
      method: "POST",
      headers: { ...authHeaders(tokenAdminA, orgAId), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("refuses a READ_ONLY actor from creating a revision (403), while still allowing them to read it", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis/revisions`, {
      method: "POST",
      headers: { ...authHeaders(tokenReadOnlyA, orgAId), "Content-Type": "application/json" },
      body: JSON.stringify({ opportunitySummary: "Tentative non autorisée." }),
    });
    expect(res.status).toBe(403);

    const readRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis/revisions`, { headers: authHeaders(tokenReadOnlyA, orgAId) });
    expect(readRes.status).toBe(200);
  });

  it("never lets another organization revise or read a tender's summary revisions (404)", async () => {
    const postRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis/revisions`, {
      method: "POST",
      headers: { ...authHeaders(tokenAdminB, orgBId), "Content-Type": "application/json" },
      body: JSON.stringify({ opportunitySummary: "Tentative cross-org." }),
    });
    expect(postRes.status).toBe(404);

    const getRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analysis/revisions`, { headers: authHeaders(tokenAdminB, orgBId) });
    expect(getRes.status).toBe(404);
  });
});
