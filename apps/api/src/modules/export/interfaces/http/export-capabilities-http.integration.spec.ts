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
 * Mission Sprint 8A.2 (correction — "le frontend ne sait pas avant le clic si l'export va
 * échouer") — preuve bout-en-bout de `GET /tenders/:tenderId/export-capabilities`, réel HTTP +
 * PostgreSQL. Vérifie que les capacités reflètent EXACTEMENT ce que `PreviewExportUseCase`
 * accepterait réellement (même repository `list`, jamais un second calcul divergent).
 */
describe("Export — capabilities endpoint, real HTTP + PostgreSQL", () => {
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
      body: JSON.stringify({ email, password, displayName: "Export Capabilities HTTP Test", termsAccepted: true }),
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

  function authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": orgId, "Content-Type": "application/json" };
  }

  async function createExportTemplate(input: { format: "DOCX" | "PDF" }): Promise<{ templateId: string; versionId: string }> {
    const createRes = await fetch(`${baseUrl}/api/v1/exports/templates`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({
        documentType: "TECHNICAL_MEMO",
        name: `ExportTpl Capabilities HTTP ${randomUUID()}`,
        format: input.format,
        config: { sections: [{ id: "SUMMARY", label: "Résumé exécutif", mandatory: true, order: 0 }] },
      }),
    });
    expect(createRes.status).toBe(201);
    const template = (await createRes.json()) as { id: string; versions: { id: string }[] };

    // Garde de non-régression : `GET exports/:exportId` (ExportController) captait cette liste
    // (exportId = "templates" → 400) tant qu'il était enregistré avant ExportTemplatesController.
    const listRes = await fetch(`${baseUrl}/api/v1/exports/templates`, { headers: authHeaders(tokenOwner) });
    expect(listRes.status).toBe(200);
    expect(((await listRes.json()) as { id: string }[]).map((item) => item.id)).toContain(template.id);

    return { templateId: template.id, versionId: template.versions[0]!.id };
  }

  async function activateExportTemplateVersion(templateId: string, versionId: string): Promise<void> {
    const activateRes = await fetch(`${baseUrl}/api/v1/exports/templates/${templateId}/versions/${versionId}/activate`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
    });
    expect(activateRes.status).toBe(200);
  }

  type CapabilitiesResponse = { canExport: boolean; canExportDocx: boolean; canExportPdf: boolean; canUseTemplate: boolean; blockers: { code: string }[] };

  async function getCapabilities(): Promise<CapabilitiesResponse> {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/export-capabilities`, { headers: authHeaders(tokenOwner) });
    expect(res.status).toBe(200);
    return (await res.json()) as CapabilitiesResponse;
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

    await prisma.organization.create({ data: { id: orgId, name: "Export Capabilities Org HTTP", slug: `export-capabilities-org-http-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const owner = await registerAndLogin(`export-capabilities-owner-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    tokenOwner = owner.token;

    await addMembership({ organizationId: orgId, userId: owner.userId, role: OrganizationRole.Owner });

    await prisma.clientAccount.create({ data: { id: clientId, organizationId: orgId, name: "Client Export Capabilities HTTP", nameNormalized: "client export capabilities http", status: "ACTIVE", createdBy: owner.userId } });
    await prisma.tender.create({ data: { id: tenderId, organizationId: orgId, clientAccountId: clientId, title: "Tender export capabilities — HTTP", status: "DRAFT", tags: [], createdBy: owner.userId } });
  }, 60000);

  afterAll(async () => {
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

  it("reports EXPORT_TEMPLATE_MISSING when no export template exists yet for the organization", async () => {
    const capabilities = await getCapabilities();
    expect(capabilities).toEqual({ canExport: false, canExportDocx: false, canExportPdf: false, canUseTemplate: false, blockers: [{ code: "EXPORT_TEMPLATE_MISSING" }] });
  });

  it("reports TEMPLATE_VERSION_MISSING when a template exists but has never been activated", async () => {
    await createExportTemplate({ format: "DOCX" });

    const capabilities = await getCapabilities();
    expect(capabilities).toEqual({ canExport: false, canExportDocx: false, canExportPdf: false, canUseTemplate: false, blockers: [{ code: "TEMPLATE_VERSION_MISSING" }] });
  });

  it("reports canExport true and the exact real formats once a template has an active version, exactly what PreviewExportUseCase would accept", async () => {
    const { templateId, versionId } = await createExportTemplate({ format: "PDF" });
    await activateExportTemplateVersion(templateId, versionId);

    const capabilities = await getCapabilities();
    expect(capabilities).toEqual({ canExport: true, canExportDocx: false, canExportPdf: true, canUseTemplate: true, blockers: [] });

    const previewRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/exports/preview`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ exportTemplateId: templateId, sections: [{ sectionId: "SUMMARY", sourceType: "MANUAL", manualContent: "Contenu." }] }),
    });
    expect(previewRes.status).toBe(201);
  });

  it("reports both canExportDocx and canExportPdf once active templates of both formats exist", async () => {
    const { templateId, versionId } = await createExportTemplate({ format: "DOCX" });
    await activateExportTemplateVersion(templateId, versionId);

    const capabilities = await getCapabilities();
    expect(capabilities.canExportDocx).toBe(true);
    expect(capabilities.canExportPdf).toBe(true);
    expect(capabilities.canExport).toBe(true);
  });
});
