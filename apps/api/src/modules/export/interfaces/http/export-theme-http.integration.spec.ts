import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import JSZip from "jszip";
import { PDFParse } from "pdf-parse";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";

const ACCENT_COLOR = "#1A73E8";

/**
 * Mission Sprint 8A.2 (correction bugs #7/#8 "thème document pas toujours appliqué") — preuve
 * bout-en-bout du chemin RÉEL emprunté par l'écran Tender ("Appel d'offres") : `POST
 * /tenders/:tenderId/exports/preview` (jamais le chemin indirect Deliverables déjà couvert par
 * `deliverables-http.integration.spec.ts`). Ouvre et parse RÉELLEMENT les octets DOCX/PDF produits
 * (jamais seulement un statut HTTP 200) — même discipline que `docx-document.renderer.spec.ts` /
 * `pdfmake-document.renderer.spec.ts`, mais ici via le pont NestJS complet
 * (`ExportThemeResolverBridgeModule` réellement câblé dans `AppModule`) et une vraie ligne
 * PostgreSQL (`DocumentTheme`/`DocumentThemeVersion` créée/activée via l'API HTTP, jamais injectée
 * directement en base).
 */
describe("Export — theme application, real HTTP + PostgreSQL (bugs #7/#8)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const clientId = randomUUID();
  const tenderThemedId = randomUUID();
  const tenderBareId = randomUUID();
  const userIds: string[] = [];

  let tokenOwner: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Export Theme HTTP Test" }),
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

  async function createAndActivateTheme(input: { tenderId: string; accentColor: string }): Promise<{ themeId: string; versionId: string }> {
    const createRes = await fetch(`${baseUrl}/api/v1/document-themes`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ scopeLevel: "TENDER", tenderId: input.tenderId, name: `Thème HTTP ${randomUUID()}`, accentColor: input.accentColor }),
    });
    expect(createRes.status).toBe(201);
    const theme = (await createRes.json()) as { id: string; versions: { id: string }[] };

    const activateRes = await fetch(`${baseUrl}/api/v1/document-themes/${theme.id}/versions/${theme.versions[0]!.id}/activate`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
    });
    expect(activateRes.status).toBe(200);

    return { themeId: theme.id, versionId: theme.versions[0]!.id };
  }

  async function createAndActivateExportTemplate(input: { documentType: string; format: "DOCX" | "PDF" }): Promise<string> {
    const createRes = await fetch(`${baseUrl}/api/v1/exports/templates`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({
        documentType: input.documentType,
        name: `ExportTpl HTTP ${randomUUID()}`,
        format: input.format,
        config: { sections: [{ id: "SUMMARY", label: "Résumé exécutif", mandatory: true, order: 0 }] },
      }),
    });
    expect(createRes.status).toBe(201);
    const template = (await createRes.json()) as { id: string; versions: { id: string }[] };

    const activateRes = await fetch(`${baseUrl}/api/v1/exports/templates/${template.id}/versions/${template.versions[0]!.id}/activate`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
    });
    expect(activateRes.status).toBe(200);

    return template.id;
  }

  type PreviewJobResponse = { id: string; format: string; status: string };

  async function previewExport(input: { tenderId: string; exportTemplateId: string }): Promise<{ status: number; job: PreviewJobResponse }> {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${input.tenderId}/exports/preview`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({
        exportTemplateId: input.exportTemplateId,
        sections: [{ sectionId: "SUMMARY", sourceType: "MANUAL", manualContent: "Contenu du mémoire technique." }],
      }),
    });
    const job = (await res.json()) as PreviewJobResponse;
    return { status: res.status, job };
  }

  async function downloadArtifact(exportId: string): Promise<Buffer> {
    const res = await fetch(`${baseUrl}/api/v1/exports/${exportId}/download`, { headers: authHeaders(tokenOwner) });
    expect(res.status).toBe(200);
    return Buffer.from(await res.arrayBuffer());
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

    await prisma.organization.create({ data: { id: orgId, name: "Export Theme Org HTTP", slug: `export-theme-org-http-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const owner = await registerAndLogin(`export-theme-owner-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    tokenOwner = owner.token;

    await addMembership({ organizationId: orgId, userId: owner.userId, role: OrganizationRole.Owner });

    await prisma.clientAccount.create({ data: { id: clientId, organizationId: orgId, name: "Client Export Theme HTTP", nameNormalized: "client export theme http", status: "ACTIVE", createdBy: owner.userId } });
    await prisma.tender.create({ data: { id: tenderThemedId, organizationId: orgId, clientAccountId: clientId, title: "Tender avec thème — HTTP", status: "DRAFT", tags: [], createdBy: owner.userId } });
    await prisma.tender.create({ data: { id: tenderBareId, organizationId: orgId, clientAccountId: clientId, title: "Tender sans thème — HTTP", status: "DRAFT", tags: [], createdBy: owner.userId } });
  }, 60000);

  afterAll(async () => {
    await prisma.exportJob.deleteMany({ where: { organizationId: orgId } });
    await prisma.exportTemplateVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.exportTemplate.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentThemeVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentTheme.deleteMany({ where: { organizationId: orgId } });
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

  it("applies the TENDER-scope theme's accent color to a real DOCX produced via the Tender export screen's own HTTP route", async () => {
    const theme = await createAndActivateTheme({ tenderId: tenderThemedId, accentColor: ACCENT_COLOR });
    const exportTemplateId = await createAndActivateExportTemplate({ documentType: "TECHNICAL_MEMO", format: "DOCX" });

    const { status, job } = await previewExport({ tenderId: tenderThemedId, exportTemplateId });
    expect(status).toBe(201);
    expect(job.format).toBe("DOCX");

    // Preuve directe en base que le pont NestJS a réellement résolu et figé le thème (jamais
    // seulement supposé depuis le rendu) — le DTO HTTP n'expose pas ces colonnes en lecture, la
    // vérification passe donc par la même table que celle utilisée par `GenerateFinalExportUseCase`
    // pour réutiliser figé le même thème sur l'export final.
    const persistedJob = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(persistedJob.themeVersionId).toBe(theme.versionId);
    expect(persistedJob.themeSourceLevel).toBe("TENDER");

    const buffer = await downloadArtifact(job.id);
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.files["word/document.xml"]!.async("string");
    expect(documentXml).toContain("1A73E8");
    // Le contenu réel de la section reste présent — le thème ne remplace jamais le contenu.
    expect(documentXml).toContain("Contenu du mémoire technique");
  }, 30000);

  it("falls back to the TENDEROS system default theme (never the other Tender's theme) for a Tender with no TENDER/CLIENT/ORGANIZATION theme of its own", async () => {
    const exportTemplateId = await createAndActivateExportTemplate({ documentType: "TECHNICAL_MEMO", format: "DOCX" });

    const { status, job } = await previewExport({ tenderId: tenderBareId, exportTemplateId });
    expect(status).toBe(201);

    // Ce dépôt seed un thème TENDEROS par défaut (mission Sprint 8A.1 §5 "4ᵉ palier de repli
    // global") — la résolution ne renvoie donc jamais `null` en pratique, mais elle ne doit JAMAIS
    // renvoyer le thème TENDER de `tenderThemedId` (mission "aucune fuite entre Tenders").
    const persistedJob = await prisma.exportJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(persistedJob.themeSourceLevel).toBe("TENDEROS");
    expect(persistedJob.themeVersionId).not.toBeNull();

    const buffer = await downloadArtifact(job.id);
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.files["word/document.xml"]!.async("string");
    expect(documentXml).not.toContain("1A73E8");
  }, 30000);

  it("produces a genuinely different, still-extractable PDF when the same Tender's active theme is applied via the real export route", async () => {
    const exportTemplateId = await createAndActivateExportTemplate({ documentType: "EXECUTIVE_SUMMARY", format: "PDF" });

    const themedResult = await previewExport({ tenderId: tenderThemedId, exportTemplateId });
    expect(themedResult.status).toBe(201);
    const themedBuffer = await downloadArtifact(themedResult.job.id);

    const bareExportTemplateId = await createAndActivateExportTemplate({ documentType: "EXECUTIVE_SUMMARY", format: "PDF" });
    const bareResult = await previewExport({ tenderId: tenderBareId, exportTemplateId: bareExportTemplateId });
    expect(bareResult.status).toBe(201);
    const bareBuffer = await downloadArtifact(bareResult.job.id);

    expect(themedBuffer.equals(bareBuffer)).toBe(false);

    const parser = new PDFParse({ data: themedBuffer });
    try {
      const textResult = await parser.getText();
      const text = textResult.pages.map((p) => p.text).join("\n");
      expect(text).toContain("Contenu du mémoire technique");
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }, 30000);

  it("isolates theme resolution per Tender when previewing concurrently — the un-themed Tender never picks up the themed one's accent color", async () => {
    const exportTemplateId = await createAndActivateExportTemplate({ documentType: "TECHNICAL_MEMO", format: "DOCX" });
    const otherExportTemplateId = await createAndActivateExportTemplate({ documentType: "TECHNICAL_MEMO", format: "DOCX" });

    const [themedResult, bareResult] = await Promise.all([
      previewExport({ tenderId: tenderThemedId, exportTemplateId }),
      previewExport({ tenderId: tenderBareId, exportTemplateId: otherExportTemplateId }),
    ]);
    expect(themedResult.status).toBe(201);
    expect(bareResult.status).toBe(201);

    const [themedBuffer, bareBuffer] = await Promise.all([downloadArtifact(themedResult.job.id), downloadArtifact(bareResult.job.id)]);

    const themedXml = await (await JSZip.loadAsync(themedBuffer)).files["word/document.xml"]!.async("string");
    const bareXml = await (await JSZip.loadAsync(bareBuffer)).files["word/document.xml"]!.async("string");
    expect(themedXml).toContain("1A73E8");
    expect(bareXml).not.toContain("1A73E8");
  }, 30000);
});
