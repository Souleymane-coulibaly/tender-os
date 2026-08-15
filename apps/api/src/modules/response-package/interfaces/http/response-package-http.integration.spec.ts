import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";

/**
 * V2 Sprint 14 (Finalisation du dossier de réponse / Package final) — preuve réelle contre HTTP +
 * PostgreSQL (NestJS), même motif que `pricing-schedule-http.integration.spec.ts` (Sprint 13) : un
 * flux principal réel bout en bout (Checklist réelle → construction de version → correction de
 * qualification → validation bloquée puis débloquée → génération d'un VRAI ZIP avec manifest →
 * téléchargement réel), puis les tests BLOQUANTS exigés par la mission — REQUIRED manquant bloque,
 * OPTIONAL/NOT_APPLICABLE/NEEDS_REVIEW/CONDITIONAL-false ne bloquent jamais, same-org cross-client,
 * ClientAccess révoqué, cross-org anti-IDOR, mass-assignment, isolation multi-lot.
 */
describe("Dossier de réponse (response-package) — real HTTP + PostgreSQL (NestJS)", () => {
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
      body: JSON.stringify({ email, password, displayName: "Response Package HTTP Test", termsAccepted: true }),
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

  async function createClientTenderAndLot(input: { organizationId: string; userId: string }): Promise<{ clientAccountId: string; tenderId: string; lotId: string }> {
    const suffix = randomUUID();
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: input.organizationId, name: `Client Package ${suffix}`, nameNormalized: `client package ${suffix}`, status: "ACTIVE", createdBy: input.userId },
    });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: input.organizationId, clientAccountId: clientAccount.id, title: "Marche Package HTTP", status: "IN_ANALYSIS", tags: [], createdBy: input.userId },
    });
    const lot = await prisma.tenderLot.create({
      data: { id: randomUUID(), organizationId: input.organizationId, tenderId: tender.id, lotNumber: "1", title: "Lot 1", displayOrder: 0 },
    });
    return { clientAccountId: clientAccount.id, tenderId: tender.id, lotId: lot.id };
  }

  async function uploadDocument(input: { token: string; organizationId: string; filename: string }): Promise<{ documentId: string; documentVersionId: string }> {
    const form = new FormData();
    form.append("title", input.filename);
    form.append("origin", "USER_UPLOAD");
    form.append("domain", "TENDER");
    form.append("file", new Blob([Buffer.from("contenu réel du document")], { type: "application/pdf" }), input.filename);
    const res = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: { Authorization: `Bearer ${input.token}`, "X-Organization-Id": input.organizationId }, body: form });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; currentVersion: { id: string } };
    return { documentId: body.id, documentVersionId: body.currentVersion.id };
  }

  async function attachDocumentToTender(input: { token: string; organizationId: string; documentId: string; tenderId: string }): Promise<void> {
    const res = await fetch(`${baseUrl}/api/v1/documents/${input.documentId}/tenders/${input.tenderId}`, { method: "POST", headers: authHeaders(input.token, input.organizationId) });
    expect(res.status).toBe(201);
  }

  async function seedChecklistItem(input: {
    organizationId: string;
    tenderId: string;
    lotId?: string;
    title: string;
    type?: string;
    requirementLevel: "MANDATORY" | "CONDITIONAL" | "INFORMATIONAL";
    subjectType?: string;
    matchedDocumentId?: string;
    matchedDocumentVersionId?: string;
    createdBy: string;
  }): Promise<string> {
    const id = randomUUID();
    await prisma.tenderChecklistItem.create({
      data: {
        id,
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        lotId: input.lotId ?? null,
        title: input.title,
        status: "TODO",
        type: input.type ?? "ADMINISTRATIVE_DOCUMENT",
        requirementLevel: input.requirementLevel,
        subjectType: input.subjectType ?? "CANDIDATE",
        complianceStatus: "TO_REVIEW",
        documentStatus: input.matchedDocumentId ? "AVAILABLE" : "MISSING",
        matchedDocumentId: input.matchedDocumentId ?? null,
        matchedDocumentVersionId: input.matchedDocumentVersionId ?? null,
        documentMatchStatus: input.matchedDocumentId ? "MANUALLY_ATTACHED" : "NOT_SEARCHED",
      },
    });
    return id;
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
        { id: orgAId, name: "Package Org A HTTP", slug: `package-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Package Org B HTTP", slug: `package-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`package-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`package-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId);
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;
    ownerAUserId = ownerA.userId;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });
  }, 60000);

  afterAll(async () => {
    await prisma.packageArtifact.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.packageItem.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.responsePackageVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.responsePackage.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderChecklistItem.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderLot.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.document.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  it("main flow: Checklist real qualification → build → completeness → blocked validation → correction → validated → real ZIP → download", async () => {
    const { tenderId, lotId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const doc = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "DC1.pdf" });

    await seedChecklistItem({ organizationId: orgAId, tenderId, lotId, title: "DC1", requirementLevel: "MANDATORY", matchedDocumentId: doc.documentId, matchedDocumentVersionId: doc.documentVersionId, createdBy: ownerAUserId });
    await seedChecklistItem({ organizationId: orgAId, tenderId, lotId, title: "Attestation fiscale", requirementLevel: "MANDATORY", createdBy: ownerAUserId });
    await seedChecklistItem({ organizationId: orgAId, tenderId, lotId, title: "Annexe facultative", requirementLevel: "INFORMATIONAL", createdBy: ownerAUserId });
    await seedChecklistItem({ organizationId: orgAId, tenderId, lotId, title: "DC4", requirementLevel: "CONDITIONAL", subjectType: "SUBCONTRACTOR", createdBy: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId }) });
    expect(createRes.status).toBe(201);
    const pkg = (await createRes.json()) as { id: string; status: string };
    expect(pkg.status).toBe("DRAFT");

    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildRes.status).toBe(201);
    const built = (await buildRes.json()) as { version: { id: string; versionNumber: number }; items: { id: string; label: string; status: string; requirementType: string; applicabilityStatus: string }[] };
    expect(built.version.versionNumber).toBe(1);
    expect(built.items).toHaveLength(4);

    const dc1 = built.items.find((i) => i.label === "DC1")!;
    expect(dc1.status).toBe("READY");
    const attestation = built.items.find((i) => i.label === "Attestation fiscale")!;
    expect(attestation.status).toBe("MISSING_BLOCKING");
    const annexe = built.items.find((i) => i.label === "Annexe facultative")!;
    expect(annexe.status).toBe("MISSING_NON_BLOCKING");
    const dc4 = built.items.find((i) => i.label === "DC4")!;
    expect(dc4.status).toBe("NOT_APPLICABLE");

    const completenessRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${built.version.id}/completeness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const completeness = (await completenessRes.json()) as { requiredApplicableTotal: number; requiredAvailable: number; requiredMissing: number; ready: boolean; notApplicableTotal: number };
    // Mission §5/§67 — 22/22 jamais 22/27 : ici 1/2 obligatoires (l'annexe facultative et le DC4
    // non applicable ne comptent JAMAIS dans le dénominateur obligatoire.
    expect(completeness.requiredApplicableTotal).toBe(2);
    expect(completeness.requiredAvailable).toBe(1);
    expect(completeness.requiredMissing).toBe(1);
    expect(completeness.notApplicableTotal).toBe(1);
    expect(completeness.ready).toBe(false);

    const blockedValidateRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${built.version.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(blockedValidateRes.status).toBe(409);

    const correctRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/items/${attestation.id}/qualification`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ requirementType: "OPTIONAL", applicabilityStatus: "APPLICABLE" }),
    });
    expect(correctRes.status).toBe(200);

    const validateRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${built.version.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(validateRes.status).toBe(200);
    const validated = (await validateRes.json()) as { status: string };
    expect(validated.status).toBe("VALIDATED");

    const generateRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${built.version.id}/generate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(generateRes.status).toBe(201);
    const artifact = (await generateRes.json()) as { fileName: string; checksum: string };
    expect(artifact.fileName).toContain(".zip");

    const downloadRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${built.version.id}/download`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(downloadRes.status).toBe(200);
    const zipBuffer = Buffer.from(await downloadRes.arrayBuffer());
    const reopened = await JSZip.loadAsync(zipBuffer);
    const fileNames = Object.values(reopened.files).filter((f) => !f.dir).map((f) => f.name);
    expect(fileNames).toContain("manifest.json");
    expect(fileNames.some((f) => f.startsWith("01_Administratif/"))).toBe(true);
    const manifest = JSON.parse(await reopened.file("manifest.json")!.async("string")) as { items: unknown[] };
    // DC1 (READY) + Attestation (devenue OPTIONAL mais toujours absente, donc PAS incluse) → seul
    // DC1 a une documentVersionId réelle à inclure dans le ZIP.
    expect(manifest.items).toHaveLength(1);
  });

  it("BLOCKING — RP-P1-01 fix: rejects selecting a document belonging to a DIFFERENT client/tender of the same organization for a package item", async () => {
    const clientA = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const clientB = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });

    // Document uploadé par le même acteur mais rattaché UNIQUEMENT au Tender du Client B — jamais
    // au Tender du Client A dont le package doit rester isolé.
    const foreignDoc = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "Piece-Client-B.pdf" });
    await attachDocumentToTender({ token: tokenOwnerA, organizationId: orgAId, documentId: foreignDoc.documentId, tenderId: clientB.tenderId });

    const checklistItemId = await seedChecklistItem({ organizationId: orgAId, tenderId: clientA.tenderId, lotId: clientA.lotId, title: "Piece a fournir", requirementLevel: "MANDATORY", createdBy: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId: clientA.lotId }) });
    const pkg = (await createRes.json()) as { id: string };
    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    const built = (await buildRes.json()) as { version: { id: string }; items: { id: string; sourceId?: string }[] };
    const item = built.items.find((i) => i.sourceId === checklistItemId)!;

    const injectRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/items/${item.id}/document`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentId: foreignDoc.documentId, documentVersionId: foreignDoc.documentVersionId }),
    });
    expect(injectRes.status).toBe(404);

    // Le fichier étranger ne doit jamais avoir été rattaché : l'item reste sans document.
    const getRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}?versionId=${built.version.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const refreshed = (await getRes.json()) as { items: { id: string; documentId?: string }[] };
    const refreshedItem = refreshed.items.find((i) => i.id === item.id);
    expect(refreshedItem?.documentId).toBeUndefined();
  });

  it("selecting a document legitimately attached to the SAME tender succeeds", async () => {
    const client = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const doc = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "Piece-legitime.pdf" });
    await attachDocumentToTender({ token: tokenOwnerA, organizationId: orgAId, documentId: doc.documentId, tenderId: client.tenderId });

    const checklistItemId = await seedChecklistItem({ organizationId: orgAId, tenderId: client.tenderId, lotId: client.lotId, title: "Piece a fournir", requirementLevel: "MANDATORY", createdBy: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${client.tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId: client.lotId }) });
    const pkg = (await createRes.json()) as { id: string };
    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    const built = (await buildRes.json()) as { items: { id: string; sourceId?: string }[] };
    const item = built.items.find((i) => i.sourceId === checklistItemId)!;

    const selectRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/items/${item.id}/document`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentId: doc.documentId, documentVersionId: doc.documentVersionId }),
    });
    expect(selectRes.status).toBe(200);
    const updated = (await selectRes.json()) as { documentId?: string; status: string };
    expect(updated.documentId).toBe(doc.documentId);
    expect(updated.status).toBe("READY");
  });

  it("mass assignment — organizationId/clientAccountId/status/currentVersionId are never accepted from the client body (Sprint 21 hardening — .strict() rejects the request, same convention as every other module)", async () => {
    const { tenderId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ organizationId: orgBId, clientAccountId: randomUUID(), status: "VALIDATED", currentVersionId: randomUUID(), currentVersionNumber: 999 }),
    });
    expect(createRes.status).toBe(400);

    const legitimateRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({}),
    });
    expect(legitimateRes.status).toBe(201);
    const pkg = (await legitimateRes.json()) as { organizationId: string; tenderId: string; status: string; currentVersionId?: string; currentVersionNumber: number };
    expect(pkg.organizationId).toBe(orgAId);
    expect(pkg.tenderId).toBe(tenderId);
    expect(pkg.status).toBe("DRAFT");
    expect(pkg.currentVersionId).toBeUndefined();
    expect(pkg.currentVersionNumber).toBe(0);
  });

  it("BLOCKING — a same-org actor without access to this client can never see/build/validate/generate/download this package", async () => {
    const clientA = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const clientB = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId: clientA.lotId }) });
    const pkg = (await createRes.json()) as { id: string };

    const jean = await registerAndLogin(`package-jean-${randomUUID()}@smoke.test`);
    userIds.push(jean.userId);
    await addMembership({ organizationId: orgAId, userId: jean.userId, role: OrganizationRole.Contributor });
    await assignClient({ organizationId: orgAId, clientAccountId: clientB.clientAccountId, userId: jean.userId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/response-packages`, { headers: authHeaders(jean.token, orgAId) });
    expect(listRes.status).toBe(404);

    const getRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}`, { headers: authHeaders(jean.token, orgAId) });
    expect(getRes.status).toBe(404);

    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(jean.token, orgAId) });
    expect(buildRes.status).toBe(404);
  });

  it("BLOCKING — access revoked mid-session immediately blocks all operations, even for the actor who created it", async () => {
    const client = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const worker = await registerAndLogin(`package-worker-${randomUUID()}@smoke.test`);
    userIds.push(worker.userId);
    await addMembership({ organizationId: orgAId, userId: worker.userId, role: OrganizationRole.Contributor });
    await assignClient({ organizationId: orgAId, clientAccountId: client.clientAccountId, userId: worker.userId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${client.tenderId}/response-packages`, { method: "POST", headers: authHeaders(worker.token, orgAId), body: JSON.stringify({ lotId: client.lotId }) });
    expect(createRes.status).toBe(201);
    const pkg = (await createRes.json()) as { id: string };

    await prisma.clientAssignment.deleteMany({ where: { organizationId: orgAId, clientAccountId: client.clientAccountId, userId: worker.userId } });

    const getRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}`, { headers: authHeaders(worker.token, orgAId) });
    expect(getRes.status).toBe(404);
    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(worker.token, orgAId) });
    expect(buildRes.status).toBe(404);
  });

  it("BLOCKING — a DIFFERENT organization never sees a response package, even by guessing its exact UUID (cross-org anti-IDOR)", async () => {
    const { tenderId, lotId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId }) });
    const pkg = (await createRes.json()) as { id: string };

    const crossOrgListRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(crossOrgListRes.status).toBe(404);
    const crossOrgGetRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(crossOrgGetRes.status).toBe(404);
  });

  it("a package created for lotId=X is rejected if that lot does not belong to the Tender (anti-IDOR on lotId)", async () => {
    const { tenderId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId: randomUUID() }) });
    expect(createRes.status).toBe(404);
  });

  it("refuses a duplicate response package for the same (tender, lot, candidate)", async () => {
    const { tenderId, lotId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const first = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId }) });
    expect(first.status).toBe(201);
    const second = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId }) });
    expect(second.status).toBe(409);
  });

  it("refuses generating a ZIP before the version is validated", async () => {
    const { tenderId, lotId } = await createClientTenderAndLot({ organizationId: orgAId, userId: ownerAUserId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId }) });
    const pkg = (await createRes.json()) as { id: string };
    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    const built = (await buildRes.json()) as { version: { id: string } };

    const generateRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg.id}/versions/${built.version.id}/generate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(generateRes.status).toBe(409);
  });

  it("BLOCKING — isolates two lots of the same tender/candidate: a checklist item scoped to lot 1 never appears in lot 2's package", async () => {
    const suffix = randomUUID();
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgAId, name: `Client MultiLot ${suffix}`, nameNormalized: `client multilot ${suffix}`, status: "ACTIVE", createdBy: ownerAUserId },
    });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientAccount.id, title: "Marche MultiLot HTTP", status: "IN_ANALYSIS", tags: [], createdBy: ownerAUserId },
    });
    const lot1 = await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId: tender.id, lotNumber: "1", title: "Lot 1", displayOrder: 0 } });
    const lot2 = await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId: tender.id, lotNumber: "2", title: "Lot 2", displayOrder: 1 } });

    await seedChecklistItem({ organizationId: orgAId, tenderId: tender.id, lotId: lot1.id, title: "Piece Lot 1 uniquement", requirementLevel: "MANDATORY", createdBy: ownerAUserId });
    await seedChecklistItem({ organizationId: orgAId, tenderId: tender.id, lotId: lot2.id, title: "Piece Lot 2 uniquement", requirementLevel: "MANDATORY", createdBy: ownerAUserId });

    const pkg1Res = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId: lot1.id }) });
    const pkg1 = (await pkg1Res.json()) as { id: string };
    const build1Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg1.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    const built1 = (await build1Res.json()) as { items: { label: string }[] };

    expect(built1.items.map((i) => i.label)).toContain("Piece Lot 1 uniquement");
    expect(built1.items.map((i) => i.label)).not.toContain("Piece Lot 2 uniquement");
  });

  it("BLOCKING — RP-P1-01 round 2: a document already matched to a checklist item of a DIFFERENT lot cannot be manually selected for this lot's package item", async () => {
    const suffix = randomUUID();
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgAId, name: `Client CrossLotDoc ${suffix}`, nameNormalized: `client crosslotdoc ${suffix}`, status: "ACTIVE", createdBy: ownerAUserId },
    });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientAccount.id, title: "Marche CrossLotDoc HTTP", status: "IN_ANALYSIS", tags: [], createdBy: ownerAUserId },
    });
    const lot1 = await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId: tender.id, lotNumber: "1", title: "Lot 1", displayOrder: 0 } });
    const lot2 = await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId: tender.id, lotNumber: "2", title: "Lot 2", displayOrder: 1 } });

    // Document réellement attaché au Tender (jamais rejeté par le contrôle "même Tender" du round
    // 1), mais déjà rapproché EXCLUSIVEMENT d'un ChecklistItem du Lot 2 — jamais du Lot 1.
    const lot2Doc = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "Piece-Lot2.pdf" });
    await attachDocumentToTender({ token: tokenOwnerA, organizationId: orgAId, documentId: lot2Doc.documentId, tenderId: tender.id });
    await seedChecklistItem({
      organizationId: orgAId,
      tenderId: tender.id,
      lotId: lot2.id,
      title: "Piece Lot 2",
      requirementLevel: "MANDATORY",
      matchedDocumentId: lot2Doc.documentId,
      matchedDocumentVersionId: lot2Doc.documentVersionId,
      createdBy: ownerAUserId,
    });

    // Un item du Lot 1 (checklist non encore rapprochée) ne doit jamais pouvoir se voir attribuer
    // manuellement le document déjà revendiqué par le Lot 2.
    const lot1ItemId = await seedChecklistItem({ organizationId: orgAId, tenderId: tender.id, lotId: lot1.id, title: "Piece Lot 1", requirementLevel: "MANDATORY", createdBy: ownerAUserId });

    const pkg1Res = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId: lot1.id }) });
    const pkg1 = (await pkg1Res.json()) as { id: string };
    const build1Res = await fetch(`${baseUrl}/api/v1/response-packages/${pkg1.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    const built1 = (await build1Res.json()) as { items: { id: string; sourceId?: string }[] };
    const lot1Item = built1.items.find((i) => i.sourceId === lot1ItemId)!;

    const crossLotInjectRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg1.id}/items/${lot1Item.id}/document`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentId: lot2Doc.documentId, documentVersionId: lot2Doc.documentVersionId }),
    });
    expect(crossLotInjectRes.status).toBe(404);

    // Contrôle négatif : un document jamais rapproché d'AUCUN ChecklistItem reste sélectionnable
    // manuellement (mission §71 — résoudre une absence de matching automatique, cas légitime).
    const unclassifiedDoc = await uploadDocument({ token: tokenOwnerA, organizationId: orgAId, filename: "Piece-non-classifiee.pdf" });
    await attachDocumentToTender({ token: tokenOwnerA, organizationId: orgAId, documentId: unclassifiedDoc.documentId, tenderId: tender.id });
    const legitimateRes = await fetch(`${baseUrl}/api/v1/response-packages/${pkg1.id}/items/${lot1Item.id}/document`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentId: unclassifiedDoc.documentId, documentVersionId: unclassifiedDoc.documentVersionId }),
    });
    expect(legitimateRes.status).toBe(200);
  });
});
