import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { STORAGE_PROVIDER, type StorageProvider } from "../../../documents";
import { computeSha256 } from "../../../../shared-kernel/file-hash";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";

const EXPORT_ARTIFACT_CONTENT = Buffer.from("%PDF-1.4 mémoire technique (fixture de test)");
const FILE_HASH = computeSha256(EXPORT_ARTIFACT_CONTENT);
const PREVIOUS_SIGNATURE_PROVIDER = process.env.SIGNATURE_PROVIDER;

/**
 * Preuve réelle HTTP + PostgreSQL du module Signature (Sprint 8A bis) — flux complet en mode FAKE
 * (exigence → confirmation → signataire → vérification → préparation → démarrage → simulation
 * locale → récupération → vérification d'intégrité → téléchargement), permissions, isolation
 * inter-tenant, et sécurité du webhook. `SIGNATURE_PROVIDER=FAKE` est fixé AVANT la compilation du
 * module Nest (lu une seule fois par les factories DI de `SignatureModule`) — jamais un appel
 * Universign réel (mission absolue).
 */
describe("Signature — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const clientAId = randomUUID();
  const tenderAId = randomUUID();
  const exportArtifactId = randomUUID();
  let exportJobId: string;
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenOwnerB: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Signature HTTP Test", termsAccepted: true }),
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

  beforeAll(async () => {
    // Mission §37 — lu UNE SEULE FOIS par les factories DI au moment de `compile()` ; jamais
    // UNIVERSIGN ici (interdiction absolue d'appeler le prestataire réel pendant le Sprint 8A bis).
    process.env.SIGNATURE_PROVIDER = "FAKE";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleRef.get(PrismaService);

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Signature Org A HTTP", slug: `signature-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Signature Org B HTTP", slug: `signature-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`signature-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`signature-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId);
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });

    await prisma.clientAccount.create({ data: { id: clientAId, organizationId: orgAId, name: "Client A", nameNormalized: "client a", status: "ACTIVE", createdBy: ownerA.userId } });
    await prisma.tender.create({ data: { id: tenderAId, organizationId: orgAId, clientAccountId: clientAId, title: "Marché HTTP", status: "DRAFT", tags: [], createdBy: ownerA.userId } });

    // Chaîne Export réelle jusqu'à un ExportArtifact FINAL/COMPLETED — aucune route HTTP ne permet
    // de produire un export FINAL en dehors du flux d'approbation Validation (hors périmètre de ce
    // test), donc semé directement (même discipline que le test d'intégration PostgreSQL).
    const templateId = randomUUID();
    await prisma.exportTemplate.create({ data: { id: templateId, organizationId: orgAId, documentType: "SIGNATURE_PACKAGE", name: `T-${randomUUID()}`, createdBy: ownerA.userId } });
    const templateVersionId = randomUUID();
    await prisma.exportTemplateVersion.create({
      data: { id: templateVersionId, organizationId: orgAId, exportTemplateId: templateId, version: 1, status: "DRAFT", format: "PDF", config: { sections: [] }, createdBy: ownerA.userId },
    });
    exportJobId = randomUUID();
    await prisma.exportJob.create({
      data: {
        id: exportJobId,
        organizationId: orgAId,
        clientAccountId: clientAId,
        tenderId: tenderAId,
        exportTemplateId: templateId,
        exportTemplateVersionId: templateVersionId,
        documentType: "SIGNATURE_PACKAGE",
        mode: "FINAL",
        format: "PDF",
        status: "COMPLETED",
        version: 1,
        createdBy: ownerA.userId,
      },
    });
    const storageKey = `exports/${orgAId}/${tenderAId}/${exportJobId}.pdf`;
    await prisma.exportArtifact.create({
      data: {
        id: exportArtifactId,
        organizationId: orgAId,
        exportJobId,
        fileName: "memoire-technique.pdf",
        mimeType: "application/pdf",
        fileSize: EXPORT_ARTIFACT_CONTENT.length,
        fileHash: FILE_HASH,
        storageKey,
        manifestJson: {},
      },
    });
    // `StartSignatureTransactionUseCase` lit RÉELLEMENT les octets de l'export figé (mission §43
    // "document FIGÉ") — un artefact seulement décrit en base sans fichier réel échouerait au
    // premier démarrage de transaction, exactement comme en production.
    const storageProvider = moduleRef.get<StorageProvider>(STORAGE_PROVIDER);
    await storageProvider.put({ key: storageKey, content: Readable.from(EXPORT_ARTIFACT_CONTENT), contentType: "application/pdf", sizeBytes: EXPORT_ARTIFACT_CONTENT.length });
  }, 60000);

  afterAll(async () => {
    if (PREVIOUS_SIGNATURE_PROVIDER === undefined) {
      delete process.env.SIGNATURE_PROVIDER;
    } else {
      process.env.SIGNATURE_PROVIDER = PREVIOUS_SIGNATURE_PROVIDER;
    }

    await prisma.signatureProviderEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.signatureArtifact.deleteMany({ where: { organizationId: orgAId } });
    await prisma.signatureParticipant.deleteMany({ where: { organizationId: orgAId } });
    await prisma.signatureTransaction.deleteMany({ where: { organizationId: orgAId } });
    await prisma.signatory.deleteMany({ where: { organizationId: orgAId } });
    await prisma.signatureRequirement.deleteMany({ where: { organizationId: orgAId } });
    await prisma.exportArtifact.deleteMany({ where: { organizationId: orgAId } });
    await prisma.exportJob.deleteMany({ where: { organizationId: orgAId } });
    await prisma.exportTemplate.deleteMany({ where: { organizationId: orgAId } });
    await prisma.tender.deleteMany({ where: { organizationId: orgAId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgAId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
  });

  it("refuses an unauthenticated request (401)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/signature-requirements`);
    expect(res.status).toBe(401);
  });

  describe("requirement → signatory → prepare guard", () => {
    let requirementId: string;
    let signatoryId: string;

    it("OWNER detects a signature requirement (201)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/signature-requirements`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ documentRef: "Acte d'engagement", mandatory: true }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; status: string };
      requirementId = body.id;
      expect(body.status).toBe("DETECTED");
    });

    it("never lets org B read org A's requirements (404, tender not found under org B)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/signature-requirements`, { headers: authHeaders(tokenOwnerB, orgBId) });
      expect(res.status).toBe(404);
    });

    it("OWNER confirms the requirement (200)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/signature-requirements/${requirementId}/confirm`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe("CONFIRMED");
    });

    it("OWNER registers a signatory (201, PENDING)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/signatories`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ firstName: "Alice", lastName: "Dupont", professionalEmail: "alice.dupont@example.com" }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; status: string };
      signatoryId = body.id;
      expect(body.status).toBe("PENDING");
    });

    it("preparing a signature request with an UNVERIFIED signatory is refused (422 SIGNATORY_NOT_VERIFIED)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/exports/${exportJobId}/signature-transactions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ signatoryIds: [signatoryId] }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("SIGNATORY_NOT_VERIFIED");
    });

    it("OWNER verifies the signatory's authority (200, VERIFIED)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/signatories/${signatoryId}/verify`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ approved: true }) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe("VERIFIED");
    });
  });

  describe("full FAKE signature transaction lifecycle", () => {
    let signatoryId: string;
    let transactionId: string;

    beforeAll(async () => {
      const registerRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/signatories`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ firstName: "Bob", lastName: "Martin", professionalEmail: "bob.martin@example.com" }),
      });
      const signatory = (await registerRes.json()) as { id: string };
      signatoryId = signatory.id;
      await fetch(`${baseUrl}/api/v1/signatories/${signatoryId}/verify`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ approved: true }) });
    });

    it("prepares a transaction against the real exportJobId (201, PREPARING, provider resolved server-side to FAKE)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/exports/${exportJobId}/signature-transactions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ signatoryIds: [signatoryId] }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; status: string; provider: string; tenderId: string };
      transactionId = body.id;
      expect(body.status).toBe("PREPARING");
      // Mission — le provider n'est JAMAIS accepté depuis le corps de la requête, toujours résolu
      // côté serveur (bug corrigé : `command.provider`/`command.tenderId` n'existent plus).
      expect(body.provider).toBe("FAKE");
      expect(body.tenderId).toBe(tenderAId);
    });

    it("lists the tender's transactions for OWNER A but never for OWNER B (tenant isolation)", async () => {
      const listA = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/signature-transactions`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(listA.status).toBe(200);
      const bodyA = (await listA.json()) as readonly { id: string }[];
      expect(bodyA.map((t) => t.id)).toContain(transactionId);

      const listB = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/signature-transactions`, { headers: authHeaders(tokenOwnerB, orgBId) });
      expect(listB.status).toBe(404);
    });

    it("never lets org B read org A's transaction (404)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/signature-transactions/${transactionId}`, { headers: authHeaders(tokenOwnerB, orgBId) });
      expect(res.status).toBe(404);
    });

    it("starts the transaction against the fake provider (200, SENT)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/signature-transactions/${transactionId}/start`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ returnUrl: "https://tenderos.example.com/return" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe("SENT");
    });

    it("syncing (simulation locale) transitions to SIGNED once the fake provider reports completion", async () => {
      const res = await fetch(`${baseUrl}/api/v1/signature-transactions/${transactionId}/sync`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe("SIGNED");
    });

    it("retrieves signed document + evidence from the fake provider, both marked as fake test evidence", async () => {
      const res = await fetch(`${baseUrl}/api/v1/signature-transactions/${transactionId}/retrieve-artifacts`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { artifacts: readonly { kind: string; isFakeTestEvidence: boolean }[] };
      expect(body.artifacts).toHaveLength(2);
      expect(body.artifacts.every((a) => a.isFakeTestEvidence)).toBe(true);
      expect(body.artifacts.map((a) => a.kind).sort()).toEqual(["PROOF", "SIGNED_DOCUMENT"]);
    });

    it("verifies integrity of the stored signed document (200, VERIFIED) — the only legitimate path to VERIFIED", async () => {
      const res = await fetch(`${baseUrl}/api/v1/signature-transactions/${transactionId}/verify`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe("VERIFIED");
    });

    it("downloads the signed document and the evidence as real byte streams", async () => {
      const docRes = await fetch(`${baseUrl}/api/v1/signature-transactions/${transactionId}/signed-document`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(docRes.status).toBe(200);
      expect(Number(docRes.headers.get("content-length"))).toBeGreaterThan(0);

      const evidenceRes = await fetch(`${baseUrl}/api/v1/signature-transactions/${transactionId}/evidence`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(evidenceRes.status).toBe(200);
      const evidenceBody = await evidenceRes.text();
      expect(evidenceBody).toContain("FAKE_TEST_EVIDENCE");
    });
  });

  describe("Universign webhook — security", () => {
    it("refuses a request with no x-jws-signature header (401)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/webhooks/universign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ any: "thing" }) });
      expect(res.status).toBe(401);
    });

    it("with a header present but SIGNATURE_PROVIDER=FAKE, refuses explicitly rather than trusting an unverifiable webhook (503)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/webhooks/universign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-jws-signature": "not-a-real-jws" },
        body: JSON.stringify({ any: "thing" }),
      });
      expect(res.status).toBe(503);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("SIGNATURE_PROVIDER_MISCONFIGURED");
    });
  });
});
