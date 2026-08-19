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
 * Mission Sprint 8A.2 (audit Cockpit Bid Manager) — `ValidationController` n'avait encore JAMAIS
 * été exercé via HTTP réel (seul `signature-http.integration.spec.ts` couvre la Signature, en
 * seedant directement en base, jamais via `GET .../readiness`). Cette lacune a laissé passer une
 * VRAIE collision de route : `TendersController` et `ValidationController` enregistraient tous
 * deux `GET tenders/:tenderId/readiness` — seule la route de `TendersController` (enregistrée en
 * premier, `TendersModule` avant `ValidationModule` dans `app.module.ts`) répondait jamais ;
 * l'écran Validation recevait silencieusement le score de complétude générique de Tenders au lieu
 * du statut d'approbation/signature réel — très probablement la cause racine réelle du bug #5.
 * Corrigée en renommant la route Validation en `tenders/:tenderId/validation/readiness`. Ce
 * fichier prouve, via HTTP réel + PostgreSQL réel, que les deux routes sont désormais
 * indépendamment atteignables avec leur forme de réponse respective, et que le statut de
 * validation progresse réellement de bout en bout (run → approbation → `activeApprovalId`).
 */
describe("Validation — real HTTP + PostgreSQL, and the tenders/:id/readiness route collision fix", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const clientId = randomUUID();
  const tenderId = randomUUID();
  const userIds: string[] = [];

  let tokenOwner: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Validation HTTP Test", termsAccepted: true }),
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

  function authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${tokenOwner}`, "X-Organization-Id": orgId, "Content-Type": "application/json" };
  }

  // Checkpoint 2.1-P2.1-FIX-E — même motif que `technical-memo-http.integration.spec.ts`/
  // `opportunity-http.integration.spec.ts` : un `Dce`/une `TenderAnalysisSummary` réels,
  // `analysisVersion`/`dceRevision` paramétrables pour piloter le scénario de dérive DCE.
  async function ensureDce(input: { organizationId: string; tenderId: string; actorId: string }): Promise<string> {
    const existing = await prisma.dce.findUnique({ where: { tenderId: input.tenderId } });
    if (existing) return existing.id;
    const created = await prisma.dce.create({ data: { id: randomUUID(), organizationId: input.organizationId, tenderId: input.tenderId, status: "IMPORTED", revision: 1, createdByUserId: input.actorId } });
    return created.id;
  }

  async function seedSucceededAnalysis(input: { organizationId: string; tenderId: string; actorId: string; analysisVersion: number; dceRevision: number }): Promise<{ dceId: string }> {
    const dceId = await ensureDce(input);
    const jobId = randomUUID();
    await prisma.analysisJob.create({
      data: { id: jobId, organizationId: input.organizationId, tenderId: input.tenderId, targetId: input.tenderId, scope: "TENDER", status: "SUCCEEDED", analysisVersion: input.analysisVersion, promptVersion: 1, triggeredByRole: "OWNER", updatedAt: new Date() },
    });
    await prisma.tenderAnalysisSummary.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        analysisJobId: jobId,
        analysisVersion: input.analysisVersion,
        dceRevision: input.dceRevision,
        opportunitySummary: "Marché HTTP validation.",
        complexityLevel: "MEDIUM",
        goNoGoRecommendation: "GO",
        goNoGoRationale: "Dossier complet.",
      },
    });
    return { dceId };
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

    await prisma.organization.create({ data: { id: orgId, name: "Validation Org HTTP", slug: `validation-org-http-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const owner = await registerAndLogin(`validation-owner-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    tokenOwner = owner.token;

    await addMembership({ organizationId: orgId, userId: owner.userId, role: OrganizationRole.Owner });

    await prisma.clientAccount.create({ data: { id: clientId, organizationId: orgId, name: "Client Validation HTTP", nameNormalized: "client validation http", status: "ACTIVE", createdBy: owner.userId } });
    await prisma.tender.create({ data: { id: tenderId, organizationId: orgId, clientAccountId: clientId, title: "Tender Validation HTTP", status: "DRAFT", tags: [], createdBy: owner.userId } });
  }, 60000);

  afterAll(async () => {
    await prisma.finalApproval.deleteMany({ where: { organizationId: orgId } });
    await prisma.validationIssue.deleteMany({ where: { organizationId: orgId } });
    await prisma.validationRun.deleteMany({ where: { organizationId: orgId } });
    await prisma.exportJob.deleteMany({ where: { organizationId: orgId } });
    await prisma.exportTemplateVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.exportTemplate.deleteMany({ where: { organizationId: orgId } });
    await prisma.tenderAnalysisSummary.deleteMany({ where: { organizationId: orgId } });
    await prisma.analysisJob.deleteMany({ where: { organizationId: orgId } });
    await prisma.dce.deleteMany({ where: { organizationId: orgId } });
    await prisma.tender.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
  }, 30000);

  it("GET tenders/:id/readiness (Tenders) keeps returning the generic completeness score, unaffected by the fix", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/readiness`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("score");
    expect(body).toHaveProperty("breakdown");
    // Preuve que ce n'est PAS la réponse de Validation (qui n'a jamais de `score`).
    expect(body).not.toHaveProperty("activeApprovalId");
  });

  it("GET tenders/:id/validation/readiness (Validation) is independently reachable and returns NOT_READY before any run — the route the collision was hiding", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/validation/readiness`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ status: "NOT_READY" });
    // Preuve que ce n'est PAS la réponse de Tenders (qui a toujours un `score`).
    expect(body).not.toHaveProperty("score");
  });

  it("progresses NOT_READY → APPROVED via a real run + approval, visible end-to-end through the now-fixed HTTP route", async () => {
    const createTemplateRes = await fetch(`${baseUrl}/api/v1/exports/templates`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        documentType: "TECHNICAL_MEMO",
        name: `Validation HTTP tpl ${randomUUID()}`,
        format: "DOCX",
        config: { sections: [{ id: "SUMMARY", label: "Résumé exécutif", mandatory: true, order: 0 }] },
      }),
    });
    expect(createTemplateRes.status).toBe(201);
    const template = (await createTemplateRes.json()) as { id: string; versions: { id: string }[] };
    const activateRes = await fetch(`${baseUrl}/api/v1/exports/templates/${template.id}/versions/${template.versions[0]!.id}/activate`, { method: "POST", headers: authHeaders() });
    expect(activateRes.status).toBe(200);

    const previewRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/exports/preview`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        exportTemplateId: template.id,
        sections: [{ sectionId: "SUMMARY", sourceType: "MANUAL", manualContent: "Contenu du mémoire technique, largement suffisant pour éviter tout avertissement de longueur." }],
      }),
    });
    expect(previewRes.status).toBe(201);
    const previewJob = (await previewRes.json()) as { id: string };

    const runRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/validation/run`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ exportJobId: previewJob.id }),
    });
    expect(runRes.status).toBe(201);
    const run = (await runRes.json()) as { id: string; readinessStatus: string; issues: unknown[] };
    expect(run.readinessStatus).not.toBe("BLOCKED");

    const readinessAfterRun = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/validation/readiness`, { headers: authHeaders() });
    const readinessAfterRunBody = (await readinessAfterRun.json()) as { status: string; latestValidationRunId?: string };
    expect(readinessAfterRunBody.latestValidationRunId).toBe(run.id);

    const approveRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/final-approval`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ validationRunId: run.id }),
    });
    expect(approveRes.status).toBe(201);
    const { approval } = (await approveRes.json()) as { approval: { id: string } };

    const readinessAfterApproval = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/validation/readiness`, { headers: authHeaders() });
    expect(readinessAfterApproval.status).toBe(200);
    const finalBody = (await readinessAfterApproval.json()) as { status: string; activeApprovalId?: string };
    // Mission Sprint 8A.2 (correction bug #5) — aucune exigence de signature configurée pour ce
    // Tender : `deriveApprovedReadiness` renvoie APPROVED directement, jamais un blocage inventé.
    expect(finalBody.status).toBe("APPROVED");
    expect(finalBody.activeApprovalId).toBe(approval.id);

    // La route Tenders reste indépendante et continue de répondre avec sa propre forme.
    const tendersReadiness = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/readiness`, { headers: authHeaders() });
    const tendersBody = (await tendersReadiness.json()) as Record<string, unknown>;
    expect(tendersBody).toHaveProperty("score");
  }, 30000);

  /**
   * Checkpoint 2.1-P2.1-FIX-E — E2E réaliste (mission §94-97, §102) : une approbation reste
   * `APPROVED` (jamais réécrite/supprimée) mais devient `STALE` dès que le DCE change et que sa
   * dernière analyse s'en trouve elle-même obsolète — jamais un faux CURRENT après un changement
   * de dossier réel. Réutilise le flux export/run/approve déjà exercé par le test précédent, sur un
   * Tender/Client dédié pour rester lisible et isolé.
   */
  it("E2E (mission §94-97) — a DCE change makes the approved validation STALE, and a re-approval against the new state makes it CURRENT again (old approval preserved, never rewritten)", async () => {
    const localClientId = randomUUID();
    const localTenderId = randomUUID();
    await prisma.clientAccount.create({ data: { id: localClientId, organizationId: orgId, name: `Client FIX-E ${localTenderId}`, nameNormalized: "client fix-e", status: "ACTIVE", createdBy: userIds[0]! } });
    await prisma.tender.create({ data: { id: localTenderId, organizationId: orgId, clientAccountId: localClientId, title: "Tender Validation FIX-E", status: "DRAFT", tags: [], createdBy: userIds[0]! } });

    const { dceId } = await seedSucceededAnalysis({ organizationId: orgId, tenderId: localTenderId, actorId: userIds[0]!, analysisVersion: 1, dceRevision: 1 });

    // Étape 1a — aucune approbation encore : UNKNOWN, jamais un faux CURRENT pour un dossier jamais
    // approuvé.
    const freshnessEmptyRes = await fetch(`${baseUrl}/api/v1/tenders/${localTenderId}/validation/freshness`, { headers: authHeaders() });
    expect(freshnessEmptyRes.status).toBe(200);
    expect((await freshnessEmptyRes.json()) as { freshness: string }).toMatchObject({ freshness: "UNKNOWN", hasActiveApproval: false });

    // Étape 1b — même flux export/run/approve que le test précédent, réutilisé sur ce Tender dédié.
    const createTemplateRes = await fetch(`${baseUrl}/api/v1/exports/templates`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ documentType: "TECHNICAL_MEMO", name: `Validation FIX-E tpl ${randomUUID()}`, format: "DOCX", config: { sections: [{ id: "SUMMARY", label: "Résumé exécutif", mandatory: true, order: 0 }] } }),
    });
    const template = (await createTemplateRes.json()) as { id: string; versions: { id: string }[] };
    await fetch(`${baseUrl}/api/v1/exports/templates/${template.id}/versions/${template.versions[0]!.id}/activate`, { method: "POST", headers: authHeaders() });

    const previewRes = await fetch(`${baseUrl}/api/v1/tenders/${localTenderId}/exports/preview`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ exportTemplateId: template.id, sections: [{ sectionId: "SUMMARY", sourceType: "MANUAL", manualContent: "Contenu du mémoire technique, largement suffisant pour éviter tout avertissement de longueur." }] }),
    });
    const previewJob = (await previewRes.json()) as { id: string };

    const runRes = await fetch(`${baseUrl}/api/v1/tenders/${localTenderId}/validation/run`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ exportJobId: previewJob.id }) });
    const run = (await runRes.json()) as { id: string };

    const approveRes = await fetch(`${baseUrl}/api/v1/tenders/${localTenderId}/final-approval`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ validationRunId: run.id }) });
    expect(approveRes.status).toBe(201);
    const { approval: approvalV1 } = (await approveRes.json()) as { approval: { id: string } };

    // Étape 1c — approbation fraîchement créée contre le DCE rev1/Analyse v1 courants : CURRENT.
    const freshnessCurrentRes = await fetch(`${baseUrl}/api/v1/tenders/${localTenderId}/validation/freshness`, { headers: authHeaders() });
    expect((await freshnessCurrentRes.json()) as { freshness: string; activeApprovalId?: string }).toMatchObject({ freshness: "CURRENT", hasActiveApproval: true, activeApprovalId: approvalV1.id });

    // Étape 2 — RC-v2 : le DCE change, AUCUNE réanalyse encore. L'analyse v1 devient elle-même
    // STALE (dceRevision=1 ≠ Dce.revision=2), donc l'approbation qui en dépend devient STALE —
    // jamais un faux CURRENT global (mission §15/§17/§95).
    await prisma.dce.update({ where: { id: dceId }, data: { revision: 2 } });

    const freshnessStaleRes = await fetch(`${baseUrl}/api/v1/tenders/${localTenderId}/validation/freshness`, { headers: authHeaders() });
    expect((await freshnessStaleRes.json()) as { freshness: string }).toMatchObject({ freshness: "STALE" });

    // L'approbation ELLE-MÊME reste APPROVED/ACTIVE — jamais réécrite, jamais supprimée (mission
    // §5 "validation historique ≠ validation courante", §13 "VALIDATED + STALE").
    const readinessStillApproved = await fetch(`${baseUrl}/api/v1/tenders/${localTenderId}/validation/readiness`, { headers: authHeaders() });
    expect((await readinessStillApproved.json()) as { status: string }).toMatchObject({ status: "APPROVED" });

    // Étape 3 — réanalyse (v2, dceRevision=2) : à elle seule, elle ne "répare" PAS rétroactivement
    // l'approbation déjà accordée (mission §25 "exiger une nouvelle validation, jamais réactiver
    // l'ancienne silencieusement").
    await seedSucceededAnalysis({ organizationId: orgId, tenderId: localTenderId, actorId: userIds[0]!, analysisVersion: 2, dceRevision: 2 });
    const freshnessStillStaleRes = await fetch(`${baseUrl}/api/v1/tenders/${localTenderId}/validation/freshness`, { headers: authHeaders() });
    expect((await freshnessStillStaleRes.json()) as { freshness: string }).toMatchObject({ freshness: "STALE" });

    // Étape 4 — une NOUVELLE approbation (V2) contre l'état courant redevient CURRENT ; V1 reste
    // historique, interrogeable, jamais supprimée.
    const runV2Res = await fetch(`${baseUrl}/api/v1/tenders/${localTenderId}/validation/run`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ exportJobId: previewJob.id }) });
    const runV2 = (await runV2Res.json()) as { id: string };
    const approveV2Res = await fetch(`${baseUrl}/api/v1/tenders/${localTenderId}/final-approval`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ validationRunId: runV2.id }) });
    expect(approveV2Res.status).toBe(201);
    const { approval: approvalV2 } = (await approveV2Res.json()) as { approval: { id: string } };
    expect(approvalV2.id).not.toBe(approvalV1.id);

    const freshnessCurrentAgainRes = await fetch(`${baseUrl}/api/v1/tenders/${localTenderId}/validation/freshness`, { headers: authHeaders() });
    expect((await freshnessCurrentAgainRes.json()) as { freshness: string; activeApprovalId?: string }).toMatchObject({ freshness: "CURRENT", activeApprovalId: approvalV2.id });

    // V1 reste historique/interrogeable, jamais supprimée (mission §5/§14).
    const historicalV1 = await prisma.finalApproval.findUnique({ where: { id: approvalV1.id } });
    expect(historicalV1).toBeTruthy();
  }, 30000);
});
