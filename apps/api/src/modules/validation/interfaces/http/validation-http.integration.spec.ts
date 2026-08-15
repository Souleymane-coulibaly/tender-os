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
});
