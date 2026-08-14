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

/**
 * V2 Sprint 5 — preuve réelle contre HTTP + PostgreSQL du module Opportunity / GO-NO-GO IA (flux
 * Niveau 1 complet, IDOR/cross-tenant, mass-assignment, concurrence de promotion réelle), même
 * motif que les autres suites `*-http.integration.spec.ts` de ce repo (voir `ai-suggestion-bridge-
 * http.integration.spec.ts`).
 */
describe("Opportunity / GO-NO-GO — real HTTP + PostgreSQL (NestJS)", () => {
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
      body: JSON.stringify({ email, password, displayName: "Opportunity HTTP Test" }),
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

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  /**
   * Audit Codex round 2 (P1 confirmé) — OWNER n'a plus de bypass client-tier SILENCIEUX pour
   * décider/promouvoir (voir `resolveGoNoGoClientAccess`) : le "chemin normal" testé ici (flux
   * complet, concurrence, Niveau 2) exige désormais une VRAIE affectation CLIENT_MANAGER sur le
   * client, même pour un OWNER — jamais le filet de secours administratif (réservé aux tests
   * dédiés du contournement tracé).
   */
  async function assignClientManager(input: { organizationId: string; clientAccountId: string; userId: string }): Promise<void> {
    await prisma.clientAssignment.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        clientAccountId: input.clientAccountId,
        userId: input.userId,
        role: "CLIENT_MANAGER",
        createdBy: input.userId,
      },
    });
  }

  async function seedSucceededAnalysis(input: { organizationId: string; tenderId: string; actorId: string }): Promise<void> {
    const jobId = randomUUID();
    await prisma.analysisJob.create({
      data: {
        id: jobId,
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        targetId: input.tenderId,
        scope: "TENDER",
        status: "SUCCEEDED",
        analysisVersion: 1,
        promptVersion: 1,
        triggeredByRole: "BID_MANAGER",
        updatedAt: new Date(),
      },
    });
    await prisma.tenderAnalysisSummary.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        analysisJobId: jobId,
        analysisVersion: 1,
        opportunitySummary: "Marché de nettoyage de bureaux, DCE complet.",
        complexityLevel: "MEDIUM",
        goNoGoRecommendation: "GO",
        goNoGoRationale: "Dossier complet, aucun signal bloquant détecté.",
      },
    });
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
        { id: orgAId, name: "Opportunity Org A HTTP", slug: `opportunity-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Opportunity Org B HTTP", slug: `opportunity-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    // V2 Sprint 22B (billing) — la promotion Opportunity -> Tender passe par CreateTenderUseCase,
    // qui consomme désormais un crédit AO : ce test exerce le module Sprint 5 (Opportunity) lui-même,
    // jamais le gating par plan.
    await prisma.organizationSubscription.createMany({
      data: [
        { id: randomUUID(), organizationId: orgAId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL", updatedAt: new Date() },
        { id: randomUUID(), organizationId: orgBId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL", updatedAt: new Date() },
      ],
    });

    const ownerA = await registerAndLogin(`opp-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`opp-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId);
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;
    ownerAUserId = ownerA.userId;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });
  }, 60000);

  afterAll(async () => {
    await prisma.goNoGoDecision.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.goNoGoReport.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.opportunityQuickScore.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.opportunity.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderAnalysisSummary.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.analysisJob.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  it("mass-assignment: a client-supplied organizationId in the body is rejected outright (strict Zod schema), never silently accepted", async () => {
    const res = await fetch(`${baseUrl}/api/v1/opportunities`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ title: "Tentative mass-assignment", organizationId: orgBId }),
    });
    expect(res.status).toBe(400);

    // Preuve que le champ n'était pas simplement ignoré : une requête sans ce champ superflu
    // réussit et est TOUJOURS scopée à l'organisation du header, jamais au corps de la requête.
    const cleanRes = await fetch(`${baseUrl}/api/v1/opportunities`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ title: "Tentative propre" }) });
    expect(cleanRes.status).toBe(201);
    const cleanBody = (await cleanRes.json()) as { organizationId: string };
    expect(cleanBody.organizationId).toBe(orgAId);
  });

  it("mission §4 — an Opportunity from another organization is not found (404, anti-enumeration IDOR)", async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/opportunities`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ title: "IDOR target" }) });
    const created = (await createRes.json()) as { id: string };

    const crossOrgRes = await fetch(`${baseUrl}/api/v1/opportunities/${created.id}`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(crossOrgRes.status).toBe(404);
  });

  it("full Level 1 flow: create -> qualify -> quick-score -> GO decision -> attach candidate -> promote, idempotently", async () => {
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "Entreprise Candidate HTTP", nameNormalized: "entreprise candidate http", status: "ACTIVE", createdBy: ownerAUserId },
    });
    await assignClientManager({ organizationId: orgAId, clientAccountId: clientAccount.id, userId: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/opportunities`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ title: "Marché de nettoyage HTTP" }) });
    expect(createRes.status).toBe(201);
    const opportunity = (await createRes.json()) as { id: string };

    await fetch(`${baseUrl}/api/v1/opportunities/${opportunity.id}/status`, { method: "PATCH", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ status: "TO_QUALIFY" }) });
    const qualifyRes = await fetch(`${baseUrl}/api/v1/opportunities/${opportunity.id}/status`, { method: "PATCH", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ status: "QUALIFIED" }) });
    expect(qualifyRes.status).toBe(200);

    const scoreRes = await fetch(`${baseUrl}/api/v1/opportunities/${opportunity.id}/quick-score`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(scoreRes.status).toBe(200);
    const score = (await scoreRes.json()) as { scoreVersion: number; globalScore: number };
    expect(score.scoreVersion).toBe(1);

    const decisionRes = await fetch(`${baseUrl}/api/v1/opportunities/${opportunity.id}/go-no-go-decisions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ decision: "GO" }),
    });
    expect(decisionRes.status).toBe(201);

    // Sans candidat rattaché -> refus explicite, jamais une promotion silencieuse.
    const promoteWithoutCandidate = await fetch(`${baseUrl}/api/v1/opportunities/${opportunity.id}/promote`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(promoteWithoutCandidate.status).toBe(422);
    const promoteWithoutCandidateBody = (await promoteWithoutCandidate.json()) as { error: { code: string } };
    expect(promoteWithoutCandidateBody.error.code).toBe("OPPORTUNITY_MISSING_CLIENT_ACCOUNT");

    await fetch(`${baseUrl}/api/v1/opportunities/${opportunity.id}`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ title: "Marché de nettoyage HTTP", clientAccountId: clientAccount.id }),
    });

    const promoteRes = await fetch(`${baseUrl}/api/v1/opportunities/${opportunity.id}/promote`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(promoteRes.status).toBe(200);
    const promoted = (await promoteRes.json()) as { opportunity: { status: string; tenderId: string }; tender: { id: string }; alreadyPromoted: boolean };
    expect(promoted.opportunity.status).toBe("PROMOTED");
    expect(promoted.alreadyPromoted).toBe(false);

    // Idempotence : un second appel renvoie le MÊME Tender, jamais un second.
    const promoteAgainRes = await fetch(`${baseUrl}/api/v1/opportunities/${opportunity.id}/promote`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(promoteAgainRes.status).toBe(200);
    const promotedAgain = (await promoteAgainRes.json()) as { tender: { id: string }; alreadyPromoted: boolean };
    expect(promotedAgain.alreadyPromoted).toBe(true);
    expect(promotedAgain.tender.id).toBe(promoted.tender.id);

    const tenderCount = await prisma.tender.count({ where: { organizationId: orgAId, title: "Marché de nettoyage HTTP" } });
    expect(tenderCount).toBe(1);
  });

  /**
   * Audit Codex round 2 (P1 confirmé) — preuve HTTP+PostgreSQL de bout en bout du contournement
   * administratif TRACÉ : `ownerAUserId` (OWNER) n'a AUCUNE `ClientAssignment` sur ce client précis
   * (contrairement au test "full Level 1 flow" ci-dessus, qui en seed une) — la décision doit être
   * refusée sans justification, puis acceptée avec, et l'AuditLog doit porter la trace du bypass.
   */
  it("lets an OWNER without a real CLIENT_MANAGER assignment decide only with a justification (tracked administrative bypass), auditable", async () => {
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "Client sans affectation", nameNormalized: "client sans affectation", status: "ACTIVE", createdBy: ownerAUserId },
    });

    const createRes = await fetch(`${baseUrl}/api/v1/opportunities`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ title: "Marché sans affectation HTTP", clientAccountId: clientAccount.id }),
    });
    const opportunity = (await createRes.json()) as { id: string };
    await fetch(`${baseUrl}/api/v1/opportunities/${opportunity.id}/status`, { method: "PATCH", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ status: "TO_QUALIFY" }) });
    await fetch(`${baseUrl}/api/v1/opportunities/${opportunity.id}/status`, { method: "PATCH", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ status: "QUALIFIED" }) });

    const withoutJustification = await fetch(`${baseUrl}/api/v1/opportunities/${opportunity.id}/go-no-go-decisions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ decision: "GO" }),
    });
    expect(withoutJustification.status).toBe(422);
    const withoutJustificationBody = (await withoutJustification.json()) as { error: { code: string } };
    expect(withoutJustificationBody.error.code).toBe("GO_NO_GO_ADMIN_BYPASS_JUSTIFICATION_REQUIRED");

    const withJustification = await fetch(`${baseUrl}/api/v1/opportunities/${opportunity.id}/go-no-go-decisions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ decision: "GO", justification: "Aucun CLIENT_MANAGER disponible — approbation via privilège d'administration." }),
    });
    expect(withJustification.status).toBe(201);

    const auditEntry = await prisma.auditLog.findFirst({
      where: { organizationId: orgAId, action: "opportunity.go_no_go_decision_recorded", resourceId: opportunity.id },
      orderBy: { createdAt: "desc" },
    });
    expect((auditEntry?.metadata as { clientAssignmentBypass?: boolean } | null)?.clientAssignmentBypass).toBe(true);
  });

  it("concurrency: two simultaneous promotion requests never create two Tenders (real PostgreSQL row-level locking)", async () => {
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "Candidat Concurrence", nameNormalized: "candidat concurrence", status: "ACTIVE", createdBy: ownerAUserId },
    });
    await assignClientManager({ organizationId: orgAId, clientAccountId: clientAccount.id, userId: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/opportunities`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ title: "Marché concurrence HTTP", clientAccountId: clientAccount.id }),
    });
    const opportunity = (await createRes.json()) as { id: string };

    await fetch(`${baseUrl}/api/v1/opportunities/${opportunity.id}/status`, { method: "PATCH", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ status: "TO_QUALIFY" }) });
    await fetch(`${baseUrl}/api/v1/opportunities/${opportunity.id}/status`, { method: "PATCH", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ status: "QUALIFIED" }) });
    await fetch(`${baseUrl}/api/v1/opportunities/${opportunity.id}/go-no-go-decisions`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ decision: "GO" }) });

    const [firstRes, secondRes] = await Promise.all([
      fetch(`${baseUrl}/api/v1/opportunities/${opportunity.id}/promote`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) }),
      fetch(`${baseUrl}/api/v1/opportunities/${opportunity.id}/promote`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) }),
    ]);

    expect([firstRes.status, secondRes.status].every((s) => s === 200)).toBe(true);
    const results = (await Promise.all([firstRes.json(), secondRes.json()])) as { tender: { id: string } }[];
    expect(results).toHaveLength(2);
    expect(results[0]?.tender.id).toBe(results[1]?.tender.id);
    expect(results[0]?.tender.id).toBeDefined();

    const tenderCount = await prisma.tender.count({ where: { organizationId: orgAId, title: "Marché concurrence HTTP" } });
    expect(tenderCount).toBe(1);
  });

  it("Level 2 — generating a report before any DCE analysis has succeeded returns 409, never a raw 500", async () => {
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "Client sans analyse", nameNormalized: "client sans analyse", status: "ACTIVE", createdBy: ownerAUserId },
    });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientAccount.id, title: "Tender sans analyse", status: "DRAFT", tags: [], createdBy: ownerAUserId },
    });

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/go-no-go/report`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("TENDER_BUSINESS_ANALYSIS_NOT_FOUND");
  });

  it("Level 2 — generates a report once a DCE analysis has succeeded, and recording a decision never touches Tender.status", async () => {
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "Client avec analyse", nameNormalized: "client avec analyse", status: "ACTIVE", createdBy: ownerAUserId },
    });
    await assignClientManager({ organizationId: orgAId, clientAccountId: clientAccount.id, userId: ownerAUserId });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientAccount.id, title: "Tender avec analyse", status: "IN_ANALYSIS", tags: [], createdBy: ownerAUserId },
    });
    await seedSucceededAnalysis({ organizationId: orgAId, tenderId: tender.id, actorId: ownerAUserId });

    const reportRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/go-no-go/report`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(reportRes.status).toBe(200);
    const report = (await reportRes.json()) as { reportVersion: number; recommendation: string };
    expect(report.reportVersion).toBe(1);

    const decisionRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/go-no-go/decisions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ decision: "GO_CONDITIONAL", conditions: "Sous réserve d'un renfort RH." }),
    });
    expect(decisionRes.status).toBe(201);

    const reloadedTender = await prisma.tender.findUniqueOrThrow({ where: { id: tender.id } });
    expect(reloadedTender.status).toBe("IN_ANALYSIS");
  });
});
