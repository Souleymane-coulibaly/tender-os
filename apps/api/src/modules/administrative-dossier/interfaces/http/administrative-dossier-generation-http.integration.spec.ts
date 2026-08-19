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
 * Sprint 8C Phase 3 — génération PDF réelle (moteur `pdfmake` déjà utilisé par Export, jamais un
 * second moteur) pour DC1/DC2/DC4/DUME/Acte d'engagement, et brouillon XML non officiel pour le
 * DUME. Vérifie : un %PDF- réel est produit et attaché comme révision (jamais une révision
 * écrasée sur régénération), l'Acte d'engagement refuse tant que le pricing n'est pas gelé, et le
 * brouillon XML DUME n'est JAMAIS persisté comme pièce administrative.
 */
describe("Administrative Dossier — Phase 3 PDF/XML generation (real HTTP + PostgreSQL)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const clientAccountId = randomUUID();
  const tenderId = randomUUID();
  const userIds: string[] = [];
  let tokenOwner: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Administrative Dossier Generation Test", termsAccepted: true }),
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

  function authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": orgId, "Content-Type": "application/json" };
  }

  async function assertRealPdf(documentId: string): Promise<void> {
    const res = await fetch(`${baseUrl}/api/v1/documents/${documentId}/download`, { headers: authHeaders(tokenOwner) });
    expect(res.status).toBe(200);
    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.subarray(-1024).toString("latin1")).toContain("%%EOF");
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleRef.get(PrismaService);

    await prisma.organization.create({ data: { id: orgId, name: "Administrative Dossier Generation Org", slug: `administrative-dossier-generation-org-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const owner = await registerAndLogin(`administrative-dossier-generation-owner-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    tokenOwner = owner.token;

    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: owner.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    await prisma.clientAccount.create({ data: { id: clientAccountId, organizationId: orgId, name: "Client Génération", nameNormalized: "client generation", status: "ACTIVE", createdBy: owner.userId } });
    await prisma.tender.create({ data: { id: tenderId, organizationId: orgId, clientAccountId, title: "Marché génération PDF/XML", status: "DRAFT", tags: [], createdBy: owner.userId } });

    const ensureDossierRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dossier`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(ensureDossierRes.status).toBe(200);
  }, 60000);

  afterAll(async () => {
    await prisma.subcontractorDeclaration.deleteMany({ where: { organizationId: orgId } });
    await prisma.engagementAct.deleteMany({ where: { organizationId: orgId } });
    await prisma.dc2DeclarationVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.dc2Declaration.deleteMany({ where: { organizationId: orgId } });
    await prisma.dumeDeclarationVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.dumeDeclaration.deleteMany({ where: { organizationId: orgId } });
    await prisma.dc1Declaration.deleteMany({ where: { organizationId: orgId } });
    await prisma.administrativeDocumentRevision.deleteMany({ where: { organizationId: orgId } });
    await prisma.administrativeDocument.deleteMany({ where: { organizationId: orgId } });
    await prisma.administrativeDossier.deleteMany({ where: { organizationId: orgId } });
    await prisma.pricingEstimateVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.pricingEstimate.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.document.deleteMany({ where: { organizationId: orgId } });
    await prisma.tender.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    // Checkpoint 2.1-A4 (correctif hygiène de test) — `CreateTenderUseCase` écrit un événement
    // Outbox (`TenderCreated`) à chaque Tender réel créé via l'API ; sans ce nettoyage,
    // `organization.deleteMany` échoue sur la FK `outbox_events_organization_id_fkey` (gap
    // pré-existant, jamais déclenché tant qu'un bug de démarrage bloquait ce fichier avant même
    // d'atteindre `afterAll`).
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
  });

  it("generates a real DC1 PDF, attaches it, and a second generation creates revision #2 — never overwriting", async () => {
    const ensureDc1 = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dc1`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(ensureDc1.status).toBe(200);

    const first = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dc1/generate-pdf`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { id: string; revisions: { id: string; revisionNumber: number; documentId: string }[] };
    expect(firstBody.revisions).toHaveLength(1);
    await assertRealPdf(firstBody.revisions[0]!.documentId);

    const second = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dc1/generate-pdf`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { id: string; revisions: { revisionNumber: number }[] };
    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.revisions.map((r) => r.revisionNumber).sort()).toEqual([1, 2]);
  });

  it("generates a real DC2 PDF from the latest structured version", async () => {
    const ensureDc2 = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dc2`, { method: "POST", headers: authHeaders(tokenOwner) });
    const dc2 = (await ensureDc2.json()) as { id: string };
    await fetch(`${baseUrl}/api/v1/administrative-dc2-declarations/${dc2.id}/versions`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ data: { legalIdentity: "SIRET 123", revenueByYear: [{ year: 2025, amountValue: 500000, amountCurrency: "EUR" }] } }),
    });

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dc2/generate-pdf`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { revisions: { documentId: string }[] };
    await assertRealPdf(body.revisions[body.revisions.length - 1]!.documentId);
  });

  it("refuses to generate the DC2 PDF before any version exists (422 DC2_DECLARATION_HAS_NO_VERSION)", async () => {
    const otherTenderId = randomUUID();
    await prisma.tender.create({ data: { id: otherTenderId, organizationId: orgId, clientAccountId, title: "Marché sans DC2", status: "DRAFT", tags: [], createdBy: userIds[0]! } });
    await fetch(`${baseUrl}/api/v1/tenders/${otherTenderId}/administrative-dossier`, { method: "POST", headers: authHeaders(tokenOwner) });
    await fetch(`${baseUrl}/api/v1/tenders/${otherTenderId}/administrative-dc2`, { method: "POST", headers: authHeaders(tokenOwner) });

    const res = await fetch(`${baseUrl}/api/v1/tenders/${otherTenderId}/administrative-dc2/generate-pdf`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("DC2_DECLARATION_HAS_NO_VERSION");

    await prisma.dc2Declaration.deleteMany({ where: { organizationId: orgId, tenderId: otherTenderId } });
    await prisma.administrativeDossier.deleteMany({ where: { organizationId: orgId, tenderId: otherTenderId } });
    await prisma.tender.deleteMany({ where: { id: otherTenderId } });
  });

  it("generates a real DC4 PDF for a subcontractor declaration", async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-subcontractors`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ subcontractorName: "Sous-traitant Génération", servicesDescription: "Peinture", amountValue: 5000, amountCurrency: "EUR" }),
    });
    const declaration = (await createRes.json()) as { id: string };

    const res = await fetch(`${baseUrl}/api/v1/administrative-subcontractors/${declaration.id}/generate-pdf`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { revisions: { documentId: string }[] };
    await assertRealPdf(body.revisions[body.revisions.length - 1]!.documentId);
  });

  it("mission — refuses to generate the Acte d'engagement PDF before the pricing is frozen, then succeeds after freezing", async () => {
    const ensureAct = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-engagement-act`, { method: "POST", headers: authHeaders(tokenOwner) });
    const act = (await ensureAct.json()) as { id: string };

    const refused = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-engagement-act/generate-pdf`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(refused.status).toBe(422);
    const refusedBody = (await refused.json()) as { error: { code: string } };
    expect(refusedBody.error.code).toBe("ENGAGEMENT_ACT_PRICING_NOT_FROZEN");

    const createEstimateRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing/estimates`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ assumptions: { workHours: 10, hourlyRate: "50.00" } }),
    });
    const estimate = (await createEstimateRes.json()) as { id: string; currentVersion: { version: number } };
    await fetch(`${baseUrl}/api/v1/administrative-engagement-acts/${act.id}/freeze-pricing`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ pricingEstimateId: estimate.id, pricingEstimateVersionNumber: estimate.currentVersion.version }),
    });

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-engagement-act/generate-pdf`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { revisions: { documentId: string }[] };
    await assertRealPdf(body.revisions[body.revisions.length - 1]!.documentId);
  });

  it("mission — DUME: generates a real PDF, and the XML draft is well-formed, non-official, and NEVER persisted as an administrative document", async () => {
    const ensureDume = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dume`, { method: "POST", headers: authHeaders(tokenOwner) });
    const dume = (await ensureDume.json()) as { id: string };
    await fetch(`${baseUrl}/api/v1/administrative-dume-declarations/${dume.id}/versions`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ data: { legalIdentity: "SIRET 456" } }),
    });

    const beforeChecklist = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-checklist`, { headers: authHeaders(tokenOwner) });
    const beforeChecklistBody = (await beforeChecklist.json()) as { lines: unknown[] };

    const pdfRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dume/generate-pdf`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(pdfRes.status).toBe(200);
    const pdfBody = (await pdfRes.json()) as { revisions: { documentId: string }[] };
    await assertRealPdf(pdfBody.revisions[pdfBody.revisions.length - 1]!.documentId);

    const xmlRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dume/xml-draft`, { headers: authHeaders(tokenOwner) });
    expect(xmlRes.status).toBe(200);
    expect(xmlRes.headers.get("content-type")).toContain("application/xml");
    expect(xmlRes.headers.get("content-disposition")).toContain("attachment");
    const xmlText = await xmlRes.text();
    expect(xmlText).toContain("<DumeBrouillonNonOfficiel>");
    expect(xmlText.toLowerCase()).toContain("non officiel");
    expect(xmlText).toContain("SIRET 456");

    // La checklist (donc jamais un package de soumission) ne change pas suite au brouillon XML —
    // seul le PDF (déjà vérifié ci-dessus) est une pièce administrative réelle.
    const afterChecklist = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-checklist`, { headers: authHeaders(tokenOwner) });
    const afterChecklistBody = (await afterChecklist.json()) as { lines: unknown[] };
    expect(afterChecklistBody.lines.length).toBe(beforeChecklistBody.lines.length);
  });
});
