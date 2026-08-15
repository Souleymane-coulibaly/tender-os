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
 * Sprint 8C Phase 1 — parcours bout-en-bout réel (HTTP + Postgres, même motif que
 * `deliverables-http.integration.spec.ts`) : création idempotente du dossier, exigence confirmée,
 * checklist calculée reflétant l'état réel, pièce créée → révision attachée → validée → checklist
 * VALIDE, rejet d'une révision, capacités calculées côté backend.
 */
describe("Administrative Dossier — real HTTP + PostgreSQL (NestJS)", () => {
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
      body: JSON.stringify({ email, password, displayName: "Administrative Dossier Test", termsAccepted: true }),
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

  async function uploadDocument(token: string, filename: string): Promise<string> {
    const form = new FormData();
    form.append("title", filename);
    form.append("origin", "USER_UPLOAD");
    form.append("domain", "TENDER");
    form.append("file", new Blob([`content-${filename}`], { type: "application/pdf" }), filename);
    const res = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "X-Organization-Id": orgId }, body: form });
    expect(res.status).toBe(201);
    const document = (await res.json()) as { id: string };
    return document.id;
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

    await prisma.organization.create({ data: { id: orgId, name: "Administrative Dossier Org", slug: `administrative-dossier-org-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const owner = await registerAndLogin(`administrative-dossier-owner-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    tokenOwner = owner.token;

    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: owner.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    await prisma.clientAccount.create({ data: { id: clientAccountId, organizationId: orgId, name: "Client Dossier Admin", nameNormalized: "client dossier admin", status: "ACTIVE", createdBy: owner.userId } });
    await prisma.tender.create({ data: { id: tenderId, organizationId: orgId, clientAccountId, title: "Marché dossier administratif", status: "DRAFT", tags: [], createdBy: owner.userId } });
  }, 60000);

  afterAll(async () => {
    await prisma.administrativeDocumentRevision.deleteMany({ where: { organizationId: orgId } });
    await prisma.administrativeDocument.deleteMany({ where: { organizationId: orgId } });
    await prisma.administrativeRequirement.deleteMany({ where: { organizationId: orgId } });
    await prisma.administrativeDossier.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.document.deleteMany({ where: { organizationId: orgId } });
    await prisma.tender.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
  });

  it("POST .../administrative-dossier is idempotent — a second call returns the SAME dossier, never a duplicate", async () => {
    const first = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dossier`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { id: string; status: string };
    expect(firstBody.status).toBe("INCOMPLETE");

    const second = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dossier`, { method: "POST", headers: authHeaders(tokenOwner) });
    const secondBody = (await second.json()) as { id: string };
    expect(secondBody.id).toBe(firstBody.id);
  });

  it("GET /administrative-document-types exposes the canonical catalog — mission §7, never a frontend-hardcoded list", async () => {
    const res = await fetch(`${baseUrl}/api/v1/administrative-document-types`, { headers: authHeaders(tokenOwner) });
    expect(res.status).toBe(200);
    const catalog = (await res.json()) as { code: string; label: string }[];
    expect(catalog.length).toBe(23);
    expect(catalog.find((t) => t.code === "DC1")?.label).toContain("DC1");
  });

  it("GET .../administrative-dossier/capabilities computes canEdit/canValidate server-side", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dossier/capabilities`, { headers: authHeaders(tokenOwner) });
    expect(res.status).toBe(200);
    const capabilities = (await res.json()) as { canView: boolean; canEdit: boolean; canValidate: boolean; blockers: string[] };
    expect(capabilities.canView).toBe(true);
    expect(capabilities.canEdit).toBe(true);
    expect(capabilities.canValidate).toBe(true);
  });

  let requirementId: string;
  let administrativeDocumentId: string;

  it("full flow: create a requirement, confirm it, checklist shows MANQUANT, then create+attach+validate a document → checklist shows VALIDE", async () => {
    const createReqRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-requirements`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ title: "Attestation fiscale", requirementType: "DOCUMENT", expectedDocumentType: "ATTESTATION_FISCALE", required: true }),
    });
    expect(createReqRes.status).toBe(201);
    const requirement = (await createReqRes.json()) as { id: string; validationStatus: string };
    expect(requirement.validationStatus).toBe("SUGGESTED");
    requirementId = requirement.id;

    const confirmRes = await fetch(`${baseUrl}/api/v1/administrative-requirements/${requirementId}`, {
      method: "PATCH",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ action: "CONFIRM" }),
    });
    expect(confirmRes.status).toBe(200);
    const confirmed = (await confirmRes.json()) as { validationStatus: string };
    expect(confirmed.validationStatus).toBe("CONFIRMED");

    const checklistAfterConfirm = (await (await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-checklist`, { headers: authHeaders(tokenOwner) })).json()) as {
      lines: { requirementId: string; state: string }[];
      completionPercentage: number;
    };
    const line1 = checklistAfterConfirm.lines.find((l) => l.requirementId === requirementId);
    expect(line1?.state).toBe("MANQUANT");
    expect(checklistAfterConfirm.completionPercentage).toBe(0);

    const createDocRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-documents`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ documentType: "ATTESTATION_FISCALE", label: "Attestation fiscale", requirementId }),
    });
    expect(createDocRes.status).toBe(201);
    const administrativeDocument = (await createDocRes.json()) as { id: string; revisions: { id: string }[] };
    administrativeDocumentId = administrativeDocument.id;
    expect(administrativeDocument.revisions).toHaveLength(1);

    const uploadedDocumentId = await uploadDocument(tokenOwner, "attestation-fiscale.pdf");

    const attachRes = await fetch(`${baseUrl}/api/v1/administrative-documents/${administrativeDocumentId}/revisions`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ documentId: uploadedDocumentId }),
    });
    expect(attachRes.status).toBe(201);
    const attached = (await attachRes.json()) as { revisions: { id: string; status: string }[] };
    expect(attached.revisions[0]?.status).toBe("IN_REVIEW");
    const revisionId = attached.revisions[0]!.id;

    const checklistAfterAttach = (await (await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-checklist`, { headers: authHeaders(tokenOwner) })).json()) as {
      lines: { requirementId: string; state: string }[];
    };
    expect(checklistAfterAttach.lines.find((l) => l.requirementId === requirementId)?.state).toBe("EN_VALIDATION");

    const validateRes = await fetch(`${baseUrl}/api/v1/administrative-documents/${administrativeDocumentId}/validate`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ revisionId }),
    });
    expect(validateRes.status).toBe(200);
    const validated = (await validateRes.json()) as { validatedRevisionId: string };
    expect(validated.validatedRevisionId).toBe(revisionId);

    const checklistAfterValidate = (await (await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-checklist`, { headers: authHeaders(tokenOwner) })).json()) as {
      lines: { requirementId: string; state: string }[];
      completionPercentage: number;
    };
    expect(checklistAfterValidate.lines.find((l) => l.requirementId === requirementId)?.state).toBe("VALIDE");
    expect(checklistAfterValidate.completionPercentage).toBe(100);

    const dossierAfter = (await (await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dossier`, { headers: authHeaders(tokenOwner) })).json()) as {
      status: string;
      completionPercentage: number;
    };
    expect(dossierAfter.status).toBe("READY");
    expect(dossierAfter.completionPercentage).toBe(100);
  });

  it("rejects a revision — mission §21, the document is never left implicitly validated", async () => {
    const createDocRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-documents`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ documentType: "RIB", label: "RIB" }),
    });
    const document = (await createDocRes.json()) as { id: string };
    const uploadedDocumentId = await uploadDocument(tokenOwner, "rib.pdf");
    const attachRes = await fetch(`${baseUrl}/api/v1/administrative-documents/${document.id}/revisions`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ documentId: uploadedDocumentId }),
    });
    const attached = (await attachRes.json()) as { revisions: { id: string }[] };
    const revisionId = attached.revisions[0]!.id;

    const rejectRes = await fetch(`${baseUrl}/api/v1/administrative-documents/${document.id}/reject`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ revisionId }),
    });
    expect(rejectRes.status).toBe(200);
    const rejected = (await rejectRes.json()) as { revisions: { status: string }[]; validatedRevisionId?: string };
    expect(rejected.revisions[0]?.status).toBe("REJECTED");
    expect(rejected.validatedRevisionId).toBeUndefined();
  });

  it("refuses to attach a document that does not exist — audit Codex P1-003, never a bare unverified id", async () => {
    const attachRes = await fetch(`${baseUrl}/api/v1/administrative-documents/${administrativeDocumentId}/revisions`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ documentId: randomUUID() }),
    });
    expect(attachRes.status).toBe(404);
  });
});
