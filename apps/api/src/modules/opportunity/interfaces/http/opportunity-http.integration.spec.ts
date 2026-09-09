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
      body: JSON.stringify({ email, password, displayName: "Opportunity HTTP Test", termsAccepted: true }),
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

  // Checkpoint 2.1-P2.1-FIX-C — un `Dce` est désormais requis pour que l'analyse résolue soit
  // `CURRENT` (sans DCE, `computeAnalysisFreshness` renvoie `UNKNOWN`, ce qui bloque maintenant la
  // génération GO/NO-GO, mission §28-29/§37) : toujours créé ici, `analysisVersion`/`dceRevision`
  // paramétrables pour les scénarios de dérive DCE/reanalyse (E2E ci-dessous).
  async function seedSucceededAnalysis(input: { organizationId: string; tenderId: string; actorId: string; analysisVersion?: number; dceRevision?: number; recommendation?: string; dceId?: string }): Promise<{ dceId: string }> {
    const analysisVersion = input.analysisVersion ?? 1;
    const dceId = input.dceId ?? (await ensureDce({ organizationId: input.organizationId, tenderId: input.tenderId, actorId: input.actorId }));
    const dceRevision = input.dceRevision ?? (await prisma.dce.findUniqueOrThrow({ where: { id: dceId }, select: { revision: true } })).revision;

    const jobId = randomUUID();
    await prisma.analysisJob.create({
      data: {
        id: jobId,
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        targetId: input.tenderId,
        scope: "TENDER",
        status: "SUCCEEDED",
        analysisVersion,
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
        analysisVersion,
        dceRevision,
        opportunitySummary: "Marché de nettoyage de bureaux, DCE complet.",
        complexityLevel: "MEDIUM",
        goNoGoRecommendation: input.recommendation ?? "GO",
        goNoGoRationale: "Dossier complet, aucun signal bloquant détecté.",
      },
    });
    return { dceId };
  }

  async function ensureDce(input: { organizationId: string; tenderId: string; actorId: string }): Promise<string> {
    const existing = await prisma.dce.findUnique({ where: { tenderId: input.tenderId } });
    if (existing) return existing.id;
    const created = await prisma.dce.create({
      data: { id: randomUUID(), organizationId: input.organizationId, tenderId: input.tenderId, status: "IMPORTED", revision: 1, createdByUserId: input.actorId },
    });
    return created.id;
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
    // Checkpoint 2.1-P2.1-FIX-C (correctif audit P1-FIXC-001) — aucune FK Prisma déclarée (simple
    // pointeur indexé, même discipline que `GoNoGoReport.candidateCompanyId`), donc jamais purgée
    // en cascade par la suppression de l'organisation ci-dessous : nettoyage explicite requis.
    await prisma.goNoGoReportVersionReservation.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.opportunityQuickScore.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.opportunity.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderAnalysisSummary.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.analysisJob.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    // Checkpoint CCV2-G.1 — les Tenders D'ABORD (FK composite `[candidateCompanyId,
    // organizationId]` : supprimer la CandidateCompany en premier declencherait un SET NULL sur
    // `organization_id`, qui est NOT NULL).
    await prisma.candidateCompany.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
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

    // Checkpoint CCV2-G.1 — POLICY A : la promotion exige AUSSI une entreprise candidate (l'entite
    // juridique qui repond), distincte du ClientAccount ci-dessus (la relation commerciale). Le
    // refus ci-dessus portait sur le CLIENT ; celui-ci porte sur le CANDIDAT.
    // Fixture ecrite en PERSISTANCE, comme le `clientAccount` ci-dessus : ce test porte sur la
    // PROMOTION, pas sur la creation d'entreprise candidate (couverte par son propre spec). Un
    // aller-retour HTTP de plus ferait deborder son budget de temps sans rien prouver de neuf.
    const candidateCompany = await prisma.candidateCompany.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        name: `Candidate HTTP ${randomUUID().slice(0, 8)}`,
        nameNormalized: `candidate http ${randomUUID().slice(0, 8)}`,
        status: "ACTIVE",
        createdBy: ownerAUserId,
      },
    });

    // Checkpoint CCV2-G.1 — le client ET l'entreprise candidate sont rattaches par le MEME PATCH :
    // aucun appel supplementaire, donc aucun besoin de relever le delai de ce test. Le refus
    // specifique `CANDIDATE_COMPANY_REQUIRED` est prouve par son spec dedie
    // (`ccv2g1-candidate-required-http.integration.spec.ts`), le redupliquer ici n'ajouterait rien.
    await fetch(`${baseUrl}/api/v1/opportunities/${opportunity.id}`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ title: "Marché de nettoyage HTTP", clientAccountId: clientAccount.id, candidateCompanyId: candidateCompany.id }),
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

    // Checkpoint CCV2-G.1 — l'Opportunity porte son entreprise candidate des la creation : ce test
    // porte sur la CONCURRENCE, pas sur l'exigence de candidat.
    const concurrencyCandidate = await prisma.candidateCompany.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        name: `Candidate concurrence ${randomUUID().slice(0, 8)}`,
        nameNormalized: `candidate concurrence ${randomUUID().slice(0, 8)}`,
        status: "ACTIVE",
        createdBy: ownerAUserId,
      },
    });

    const createRes = await fetch(`${baseUrl}/api/v1/opportunities`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ title: "Marché concurrence HTTP", clientAccountId: clientAccount.id, candidateCompanyId: concurrencyCandidate.id }),
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


  /**
   * Checkpoint TENDEROS-2.1-CCV2-G.2 — la generation GO/NO-GO exige desormais une entreprise
   * candidate : c'est elle, et non le profil du client commercial, qui porte les capacites notees.
   * Ce helper en cree une reelle pour les tests dont le sujet est le rapport lui-meme.
   */
  async function createCandidateCompanyFor(organizationId: string, createdBy: string): Promise<string> {
    const id = randomUUID();
    await prisma.candidateCompany.create({
      data: { id, organizationId, name: `Candidat GO-NO-GO ${id}`, nameNormalized: `candidat go-no-go ${id}`, status: "ACTIVE", createdBy },
    });
    return id;
  }

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
      data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientAccount.id, candidateCompanyId: await createCandidateCompanyFor(orgAId, ownerAUserId), title: "Tender avec analyse", status: "IN_ANALYSIS", tags: [], createdBy: ownerAUserId },
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

  // Checkpoint 2.1-P2.1-FIX-C (mission §59) — scénario de bout en bout complet contre une vraie
  // base PostgreSQL : DCE rev1 -> analyse CURRENT -> GO/NO-GO GO -> confirmation humaine -> DCE
  // rev2 (contrainte bloquante ajoutée) -> l'ancien GO/NO-GO devient STALE IMMÉDIATEMENT, avant
  // toute réanalyse -> réanalyse -> recalcul GO/NO-GO -> nouvelle recommandation potentiellement
  // NO_GO -> l'ancien GO reste historique/auditable, jamais la décision courante.
  it("E2E — a DCE change makes the old GO/NO-GO immediately STALE, blocks recalculation until reanalysis, and the historical GO decision is preserved (never silently reattributed)", async () => {
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "Client E2E FIX-C", nameNormalized: "client e2e fix-c", status: "ACTIVE", createdBy: ownerAUserId },
    });
    await assignClientManager({ organizationId: orgAId, clientAccountId: clientAccount.id, userId: ownerAUserId });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientAccount.id, candidateCompanyId: await createCandidateCompanyFor(orgAId, ownerAUserId), title: "Tender E2E FIX-C", status: "IN_ANALYSIS", tags: [], createdBy: ownerAUserId },
    });

    const { dceId } = await seedSucceededAnalysis({ organizationId: orgAId, tenderId: tender.id, actorId: ownerAUserId, analysisVersion: 1, dceRevision: 1 });

    const firstReportRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/go-no-go/report`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(firstReportRes.status).toBe(200);
    const g1 = (await firstReportRes.json()) as { id: string; reportVersion: number; freshness: string; recommendation: string };
    expect(g1.freshness).toBe("CURRENT");

    const decisionOnG1Res = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/go-no-go/decisions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ decision: "GO", linkedReportId: g1.id }),
    });
    expect(decisionOnG1Res.status).toBe(201);
    const decisionOnG1 = (await decisionOnG1Res.json()) as { id: string; linkedReportId: string };
    expect(decisionOnG1.linkedReportId).toBe(g1.id);

    // Le DCE change (RC-v2, simulé directement — le mécanisme d'incrément lui-même est déjà
    // couvert par FIX-A) : rev1 -> rev2.
    await prisma.dce.update({ where: { id: dceId }, data: { revision: { increment: 1 } } });

    // BLOQUANT (mission §10) — G1 devient STALE IMMÉDIATEMENT, avant toute réanalyse.
    const g1AfterDceChangeRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/go-no-go/report`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(g1AfterDceChangeRes.status).toBe(200);
    const g1AfterDceChange = (await g1AfterDceChangeRes.json()) as { id: string; freshness: string; dceStale: boolean };
    expect(g1AfterDceChange.id).toBe(g1.id);
    expect(g1AfterDceChange.freshness).toBe("STALE");
    expect(g1AfterDceChange.dceStale).toBe(true);

    // BLOQUANT (mission §28-29) — le recalcul est refusé tant que l'analyse n'est pas réactualisée.
    const blockedRecalcRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/go-no-go/report`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(blockedRecalcRes.status).toBe(409);
    expect(((await blockedRecalcRes.json()) as { error: { code: string } }).error.code).toBe("GO_NO_GO_ANALYSIS_NOT_CURRENT");

    // Réanalyse : nouvelle TenderAnalysisSummary rattachée à dceRevision=2, recommandation NO_GO
    // (RC-v2 a introduit une contrainte bloquante).
    await seedSucceededAnalysis({ organizationId: orgAId, tenderId: tender.id, actorId: ownerAUserId, analysisVersion: 2, dceRevision: 2, recommendation: "NO_GO", dceId });

    const g2Res = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/go-no-go/report`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(g2Res.status).toBe(200);
    const g2 = (await g2Res.json()) as { id: string; reportVersion: number; freshness: string; analysisVersion: number };
    expect(g2.freshness).toBe("CURRENT");
    expect(g2.analysisVersion).toBe(2);
    expect(g2.id).not.toBe(g1.id);

    const decisionOnG2Res = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/go-no-go/decisions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ decision: "NO_GO", justification: "RC-v2 ajoute une contrainte bloquante.", linkedReportId: g2.id }),
    });
    expect(decisionOnG2Res.status).toBe(201);

    // BLOQUANT — l'historique complet reste consultable et cohérent : G1 toujours STALE, la
    // décision GO sur G1 jamais réattribuée à G2, les deux rapports et les deux décisions coexistent.
    const historyRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/go-no-go/reports`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const history = (await historyRes.json()) as { id: string; reportVersion: number; freshness: string }[];
    expect(history).toHaveLength(2);
    const historicalG1 = history.find((r) => r.id === g1.id)!;
    const currentG2 = history.find((r) => r.id === g2.id)!;
    expect(historicalG1.freshness).toBe("STALE");
    expect(currentG2.freshness).toBe("CURRENT");

    const decisionsRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/go-no-go/decisions`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const decisions = (await decisionsRes.json()) as { id: string; decision: string; linkedReportId?: string }[];
    expect(decisions).toHaveLength(2);
    expect(decisions.find((d) => d.id === decisionOnG1.id)?.linkedReportId).toBe(g1.id);
    expect(decisions.find((d) => d.id === decisionOnG1.id)?.decision).toBe("GO");
    expect(decisions.find((d) => d.linkedReportId === g2.id)?.decision).toBe("NO_GO");
  });

  // Correctif audit P1-FIXC-001 — preuve réelle contre PostgreSQL avec deux vraies requêtes HTTP
  // concurrentes (jamais une simulation séquentielle) : le verrou consultatif de `reserveVersion`
  // garantit qu'aucune collision de `reportVersion` ne survient jamais, même sous charge réelle.
  it("concurrency: two simultaneous GO/NO-GO generation requests for the same Tender never collide on reportVersion (real PostgreSQL advisory lock)", async () => {
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "Client Concurrence GO/NO-GO", nameNormalized: "client concurrence go no go", status: "ACTIVE", createdBy: ownerAUserId },
    });
    await assignClientManager({ organizationId: orgAId, clientAccountId: clientAccount.id, userId: ownerAUserId });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientAccount.id, candidateCompanyId: await createCandidateCompanyFor(orgAId, ownerAUserId), title: "Tender Concurrence GO/NO-GO", status: "IN_ANALYSIS", tags: [], createdBy: ownerAUserId },
    });
    await seedSucceededAnalysis({ organizationId: orgAId, tenderId: tender.id, actorId: ownerAUserId });

    const [firstRes, secondRes] = await Promise.all([
      fetch(`${baseUrl}/api/v1/tenders/${tender.id}/go-no-go/report`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) }),
      fetch(`${baseUrl}/api/v1/tenders/${tender.id}/go-no-go/report`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) }),
    ]);
    expect([firstRes.status, secondRes.status].every((s) => s === 200)).toBe(true);
    const results = (await Promise.all([firstRes.json(), secondRes.json()])) as { id: string; reportVersion: number }[];

    expect(results[0]!.reportVersion).not.toBe(results[1]!.reportVersion);
    expect(new Set(results.map((r) => r.reportVersion)).size).toBe(2);

    const versions = await prisma.goNoGoReport.findMany({ where: { organizationId: orgAId, tenderId: tender.id }, select: { reportVersion: true } });
    expect(versions).toHaveLength(2);
    expect(new Set(versions.map((v) => v.reportVersion))).toEqual(new Set([1, 2]));
  });
});
