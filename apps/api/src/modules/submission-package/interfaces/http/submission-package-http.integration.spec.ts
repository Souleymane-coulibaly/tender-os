import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { computeSha256 } from "../../../../shared-kernel/file-hash";
import { STORAGE_PROVIDER, type StorageProvider } from "../../../documents";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";

const EXPORT_ARTIFACT_CONTENT = Buffer.from("%PDF-1.4 mémoire technique approuvée (fixture de test)");
const FILE_HASH = computeSha256(EXPORT_ARTIFACT_CONTENT);

/**
 * Preuve réelle HTTP + PostgreSQL du module SubmissionPackage (Sprint 8A bis) — dernier maillon de
 * la chaîne Export ← {Validation, Signature} ← Package : n'expose AUCUNE route pour produire les
 * étapes en amont (hors périmètre HTTP de ce module), donc l'approbation active et l'artefact FINAL
 * sont semés directement via Prisma, comme pour les autres tests HTTP de ce sprint.
 */
describe("SubmissionPackage — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const clientAId = randomUUID();
  const userIds: string[] = [];

  let ownerAUserId: string;
  let ownerBUserId: string;
  let tokenOwnerA: string;
  let tokenOwnerB: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Package HTTP Test", termsAccepted: true }),
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

  async function uploadDocument(filename: string): Promise<{ documentId: string; documentVersionId: string }> {
    const form = new FormData();
    form.append("title", filename);
    form.append("origin", "USER_UPLOAD");
    form.append("domain", "TENDER");
    form.append("file", new Blob([`content-${filename}-${randomUUID()}`], { type: "application/pdf" }), filename);
    const res = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: { Authorization: `Bearer ${tokenOwnerA}`, "X-Organization-Id": orgAId }, body: form });
    expect(res.status).toBe(201);
    const document = (await res.json()) as { id: string; currentVersion: { id: string } };
    return { documentId: document.id, documentVersionId: document.currentVersion.id };
  }

  /** Checkpoint TENDEROS-2.1-P2.2-F4.1 — construit un dossier de réponse V2 RÉEL (Lot, item
   *  checklist MANDATORY satisfait, build → validate → generate), CURRENT et VALIDATED : depuis ce
   *  checkpoint, `POST .../packages` REFUSE tout Tender sans ce dossier V2 résolu (mission §1 "le
   *  dossier certifié par readiness doit être le dossier qui alimente le dépôt"). Retourne assez
   *  d'informations pour prouver, dans les tests, que le wrapper créé référence EXACTEMENT ce
   *  dossier V2. */
  async function seedResponsePackageV2(input: { tenderId: string }): Promise<{ responsePackageId: string; responsePackageVersionId: string; artifactId: string; artifactChecksum: string }> {
    const doc = await uploadDocument("piece-v2.pdf");
    await prisma.tenderChecklistItem.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        tenderId: input.tenderId,
        // Checkpoint TENDEROS-2.1-P2.2-F4.1 — `lotId: null` délibérément (mode GLOBAL, mission §7) :
        // un item/package SCOPÉ à un lot déclencherait le mode LOT (F2.3 "au moins un lot REQUIS a
        // un dossier scopé à lui") même pour un Tender à un seul lot — jamais le comportement voulu
        // ici (GLOBAL HAPPY PATH, TEST 1). Le mode LOT est couvert par TEST 10 séparément.
        lotId: null,
        title: "Pièce V2",
        status: "TODO",
        type: "ADMINISTRATIVE_DOCUMENT",
        requirementLevel: "MANDATORY",
        subjectType: "CANDIDATE",
        complianceStatus: "TO_REVIEW",
        documentStatus: "AVAILABLE",
        matchedDocumentId: doc.documentId,
        matchedDocumentVersionId: doc.documentVersionId,
        documentMatchStatus: "MANUALLY_ATTACHED",
      },
    });

    const createRpRes = await fetch(`${baseUrl}/api/v1/tenders/${input.tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) });
    expect(createRpRes.status).toBe(201);
    const rp = (await createRpRes.json()) as { id: string };

    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${rp.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildRes.status).toBe(201);
    const built = (await buildRes.json()) as { version: { id: string } };

    const validateRes = await fetch(`${baseUrl}/api/v1/response-packages/${rp.id}/versions/${built.version.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(validateRes.status).toBe(200);

    const generateRes = await fetch(`${baseUrl}/api/v1/response-packages/${rp.id}/versions/${built.version.id}/generate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(generateRes.status).toBe(201);
    const artifact = (await generateRes.json()) as { id: string; checksum: string };

    return { responsePackageId: rp.id, responsePackageVersionId: built.version.id, artifactId: artifact.id, artifactChecksum: artifact.checksum };
  }

  /** Sème un Tender avec la chaîne Export FINAL/COMPLETED complète jusqu'à une FinalApproval
   *  ACTIVE — le seul chemin réel pour rendre un Tender "packageable" hors périmètre HTTP. */
  async function seedApprovedTender(ownerId: string): Promise<{ tenderId: string }> {
    const tenderId = randomUUID();
    await prisma.tender.create({ data: { id: tenderId, organizationId: orgAId, clientAccountId: clientAId, title: "Marché HTTP Package", status: "DRAFT", tags: [], createdBy: ownerId } });

    const templateId = randomUUID();
    await prisma.exportTemplate.create({ data: { id: templateId, organizationId: orgAId, documentType: "TECHNICAL_MEMO", name: `T-${randomUUID()}`, createdBy: ownerId } });
    const templateVersionId = randomUUID();
    await prisma.exportTemplateVersion.create({
      data: { id: templateVersionId, organizationId: orgAId, exportTemplateId: templateId, version: 1, status: "DRAFT", format: "PDF", config: { sections: [] }, createdBy: ownerId },
    });
    const exportJobId = randomUUID();
    const storageKey = `exports/${orgAId}/${tenderId}/${exportJobId}.pdf`;
    await prisma.exportJob.create({
      data: {
        id: exportJobId,
        organizationId: orgAId,
        clientAccountId: clientAId,
        tenderId,
        exportTemplateId: templateId,
        exportTemplateVersionId: templateVersionId,
        documentType: "TECHNICAL_MEMO",
        mode: "FINAL",
        format: "PDF",
        status: "COMPLETED",
        version: 1,
        createdBy: ownerId,
      },
    });
    await prisma.exportArtifact.create({
      data: {
        id: randomUUID(),
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
    const storageProvider = app.get<StorageProvider>(STORAGE_PROVIDER);
    await storageProvider.put({ key: storageKey, content: Readable.from(EXPORT_ARTIFACT_CONTENT), contentType: "application/pdf", sizeBytes: EXPORT_ARTIFACT_CONTENT.length });

    const validationRunId = randomUUID();
    await prisma.validationRun.create({ data: { id: validationRunId, organizationId: orgAId, clientAccountId: clientAId, tenderId, exportJobId, readinessStatus: "READY_FOR_APPROVAL", runBy: ownerId } });

    const approvalId = randomUUID();
    await prisma.finalApproval.create({
      data: { id: approvalId, organizationId: orgAId, clientAccountId: clientAId, tenderId, exportJobId, validationRunId, manifestHash: FILE_HASH, approvedBy: ownerId, approverRole: "OWNER" },
    });

    return { tenderId };
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
    // Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 1 — CreateSubmissionPackageUseCase gate désormais
    // canOperateOnTender : ENTERPRISE (illimité) évite tout effet de bord de quota/AO credits.
    await prisma.organizationSubscription.createMany({
      data: [
        { id: randomUUID(), organizationId: orgAId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
        { id: randomUUID(), organizationId: orgBId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
      ],
    });

    const ownerA = await registerAndLogin(`package-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`package-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId);
    ownerAUserId = ownerA.userId;
    ownerBUserId = ownerB.userId;
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });

    await prisma.clientAccount.create({ data: { id: clientAId, organizationId: orgAId, name: "Client A", nameNormalized: "client a", status: "ACTIVE", createdBy: ownerA.userId } });
  }, 60000);

  afterAll(async () => {
    // Checkpoint TENDEROS-2.1-P2.3-E12.4 FIX-1 (H6-01) — l'application est fermee AVANT la purge,
    // jamais apres. Preuve a l'origine de ce correctif : sur 246 organisations residuelles, les
    // tables qui bloquaient encore leur suppression etaient `outbox_events` (440 lignes) et
    // `audit_logs` (218) — ecrites par le travail de fond APRES que ce teardown les ait purgees.
    // La suppression finale de l'organisation violait alors la FK, `afterAll` avortait, et toute
    // la fixture racine (organisation, utilisateurs, sessions) fuyait d'un run a l'autre.
    // `app.close()` attend desormais le travail en vol (`BackgroundTaskRunner`, E12.3) : apres ce
    // point plus aucune ecriture n'est possible, la purge est donc deterministe. Prisma se
    // reconnecte paresseusement pour les suppressions ci-dessous.
    await app.close();
    await prisma.packageFile.deleteMany({ where: { organizationId: orgAId } });
    await prisma.submissionPackage.deleteMany({ where: { organizationId: orgAId } });
    // TEST HYGIENE (Checkpoint TENDEROS-2.1-P2.2-F5) — le nouveau test de garde signature sème des
    // `SignatureTransaction`/`SignatureArtifact` référençant `ExportArtifact` (FK stricte) : doivent
    // être nettoyées AVANT `exportArtifact.deleteMany` ci-dessous, jamais après.
    await prisma.signatureArtifact.deleteMany({ where: { organizationId: orgAId } });
    await prisma.signatureTransaction.deleteMany({ where: { organizationId: orgAId } });
    await prisma.signatureRequirement.deleteMany({ where: { organizationId: orgAId } });
    await prisma.finalApproval.deleteMany({ where: { organizationId: orgAId } });
    await prisma.validationRun.deleteMany({ where: { organizationId: orgAId } });
    await prisma.exportArtifact.deleteMany({ where: { organizationId: orgAId } });
    await prisma.exportJob.deleteMany({ where: { organizationId: orgAId } });
    await prisma.exportTemplate.deleteMany({ where: { organizationId: orgAId } });
    // Sprint 8C Phase 2 — les pièces administratives uploadées via /documents ont leur propre FK
    // directe vers organization_id (pas seulement via tender, qui cascade déjà les tables
    // administrative_*), donc jamais laissées derrière avant la suppression de l'organisation.
    await prisma.documentVersion.deleteMany({ where: { organizationId: orgAId } });
    await prisma.document.deleteMany({ where: { organizationId: orgAId } });
    // Checkpoint TENDEROS-2.1-P2.2-F4.1 — CandidateCompany référencée PAR le Tender (jamais
    // l'inverse, même motif que partout ailleurs ce trimestre) : se nettoie AVANT le Tender lui-même
    // n'est pas nécessaire (`Tender.candidateCompanyId` n'a pas de contrainte ON DELETE bloquante
    // dans ce sens), mais explicite quand même pour ne rien laisser derrière.
    await prisma.tender.deleteMany({ where: { organizationId: orgAId } });
    await prisma.candidateCompany.deleteMany({ where: { organizationId: orgAId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgAId } });
    // TEST 12 (CROSS TENANT) — un Tender/ClientAccount dédié à org B, jamais nettoyé par les lignes
    // ci-dessus (scopées orgAId).
    await prisma.tender.deleteMany({ where: { organizationId: orgBId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgBId } });
    // TEST HYGIENE (Checkpoint TENDEROS-2.1-P2.2-F4.1, mission §22) — `outbox_events_organization_id_fkey`
    // est une vraie FK SQL (ON DELETE RESTRICT) jamais déclarée côté Prisma (`OutboxEvent` n'a
    // aucune relation `organization` dans le schéma) : les lignes s'accumulent au fil des vraies
    // routes HTTP exercées par cette suite (F4.1 en déclenche via response-package/technical-memo/
    // administrative-dossier) et doivent être nettoyées explicitement AVANT `organization.deleteMany`
    // — même correctif déjà appliqué dans `submission-http.integration.spec.ts`
    // (TENDEROS-2.1-P2.1-FINAL-HYGIENE), jamais un `deleteMany({})` global (scope strictement les
    // deux organisations de cette suite). Corrige le teardown SEULEMENT — aucun changement de
    // production.
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
  });

  it("refuses an unauthenticated request (401)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${randomUUID()}/packages`);
    expect(res.status).toBe(401);
  });

  it("refuses packaging a tender with no active final approval (422 PACKAGE_NOT_READY)", async () => {
    const bareTenderId = randomUUID();
    await prisma.tender.create({ data: { id: bareTenderId, organizationId: orgAId, clientAccountId: clientAId, title: "Marché sans approbation", status: "DRAFT", tags: [], createdBy: ownerAUserId } });

    const res = await fetch(`${baseUrl}/api/v1/tenders/${bareTenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PACKAGE_NOT_READY");
  });

  describe("full lifecycle on an approved tender (no signature required)", () => {
    let tenderId: string;
    let packageId: string;
    let v2: { responsePackageId: string; responsePackageVersionId: string; artifactId: string; artifactChecksum: string };

    beforeAll(async () => {
      const seeded = await seedApprovedTender(ownerAUserId);
      tenderId = seeded.tenderId;
      v2 = await seedResponsePackageV2({ tenderId });
    });

    it("OWNER creates a package (201, COMPLETED, readiness APPROVED since no mandatory signature was confirmed) — wraps the exact V2 PackageArtifact", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        id: string;
        status: string;
        readinessStatus: string;
        version: number;
        files: readonly { archivePath: string; sourceType: string; sourceId?: string; fileHash: string }[];
        responsePackageVersionId?: string;
        responsePackageArtifactId?: string;
        responsePackageArtifactChecksum?: string;
      };
      packageId = body.id;
      expect(body.status).toBe("COMPLETED");
      expect(body.readinessStatus).toBe("APPROVED");
      expect(body.version).toBe(1);
      // Checkpoint TENDEROS-2.1-P2.2-F4.1 — provenance PROVABLE : exactement le dossier V2 résolu.
      expect(body.responsePackageVersionId).toBe(v2.responsePackageVersionId);
      expect(body.responsePackageArtifactId).toBe(v2.artifactId);
      expect(body.responsePackageArtifactChecksum).toBe(v2.artifactChecksum);
      const v2Entry = body.files.find((f) => f.sourceType === "RESPONSE_PACKAGE_ARTIFACT");
      expect(v2Entry?.sourceId).toBe(v2.responsePackageVersionId);
      expect(v2Entry?.fileHash).toBe(v2.artifactChecksum);
      expect(v2Entry?.archivePath).toContain("dossier-reponse-v2/");
      // Le legacy EXPORT_ARTIFACT reste présent (compatibilité opérationnelle, mission §5) —
      // l'ADMINISTRATIVE_DOCUMENT indépendant, lui, n'est PLUS produit (déjà dans le V2 embarqué).
      expect(body.files.some((f) => f.sourceType === "ADMINISTRATIVE_DOCUMENT")).toBe(false);
      expect(body.files.map((f) => f.archivePath).sort()).toEqual(["manifest.json", "memoire-technique.pdf", v2Entry!.archivePath].sort());
    });

    it("never lets org B read org A's package (404)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/packages/${packageId}`, { headers: authHeaders(tokenOwnerB, orgBId) });
      expect(res.status).toBe(404);
    });

    it("OWNER reads their own package (200)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/packages/${packageId}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBe(packageId);
    });

    it("GET tender packages lists it", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as readonly { id: string }[];
      expect(body.map((p) => p.id)).toContain(packageId);
    });

    it("downloads a REAL ZIP containing the export artifact, the embedded V2 artifact, and a manifest.json with matching hashes", async () => {
      const res = await fetch(`${baseUrl}/api/v1/packages/${packageId}/download`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/zip");

      const arrayBuffer = await res.arrayBuffer();
      const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer));
      // JSZip crée une entrée de DOSSIER explicite ("dossier-reponse-v2/") en plus du fichier
      // nesté lui-même — jamais un fichier réel, exclue de la comparaison.
      const realFilePaths = Object.keys(zip.files).filter((p) => !p.endsWith("/"));
      const v2Path = realFilePaths.find((p) => p.startsWith("dossier-reponse-v2/"))!;
      expect(realFilePaths.sort()).toEqual(["manifest.json", "memoire-technique.pdf", v2Path].sort());

      const extractedPdf = await zip.file("memoire-technique.pdf")!.async("nodebuffer");
      expect(extractedPdf.equals(EXPORT_ARTIFACT_CONTENT)).toBe(true);

      // Checkpoint TENDEROS-2.1-P2.2-F4.1 (TEST 2 — CONTENT PARITY) — l'entrée embarquée est
      // EXACTEMENT le PackageArtifact V2 (même checksum), jamais une reconstruction approximative.
      const extractedV2 = await zip.file(v2Path)!.async("nodebuffer");
      expect(computeSha256(extractedV2)).toBe(v2.artifactChecksum);

      const manifestText = await zip.file("manifest.json")!.async("string");
      const manifest = JSON.parse(manifestText) as { packageId: string; files: readonly { archivePath: string; fileHash: string; sourceType: string; sourceId?: string }[] };
      expect(manifest.packageId).toBe(packageId);
      const pdfEntry = manifest.files.find((f) => f.archivePath === "memoire-technique.pdf");
      expect(pdfEntry!.fileHash).toBe(FILE_HASH);
      const v2ManifestEntry = manifest.files.find((f) => f.sourceType === "RESPONSE_PACKAGE_ARTIFACT");
      expect(v2ManifestEntry?.sourceId).toBe(v2.responsePackageVersionId);
      expect(v2ManifestEntry?.fileHash).toBe(v2.artifactChecksum);
    });

    it("creating a second package for the same tender produces version 2, never overwriting version 1 (V2 dossier unchanged, still CURRENT)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { version: number; responsePackageVersionId?: string };
      expect(body.version).toBe(2);
      expect(body.responsePackageVersionId).toBe(v2.responsePackageVersionId);

      const stillThere = await fetch(`${baseUrl}/api/v1/packages/${packageId}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(stillThere.status).toBe(200);
    });
  });

  describe("Checkpoint TENDEROS-2.1-P2.2-F4.1 — legacy content no longer reconstructed independently", () => {
    it("TEST 2 (CONTENT PARITY) — a package for a tender with a validated administrative document never re-derives it independently: only the embedded V2 artifact represents it", async () => {
      const { tenderId } = await seedApprovedTender(ownerAUserId);

      const ensureDossierRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dossier`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(ensureDossierRes.status).toBe(200);

      const createDocRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-documents`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ documentType: "RIB", label: "RIB" }),
      });
      expect(createDocRes.status).toBe(201);
      const administrativeDocument = (await createDocRes.json()) as { id: string; revisions: readonly { id: string }[] };

      const uploaded = await uploadDocument("rib-package.pdf");
      const attachRes = await fetch(`${baseUrl}/api/v1/administrative-documents/${administrativeDocument.id}/revisions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ documentId: uploaded.documentId }),
      });
      expect(attachRes.status).toBe(201);
      const attached = (await attachRes.json()) as { revisions: readonly { id: string }[] };
      const revisionId = attached.revisions[0]!.id;

      const validateRes = await fetch(`${baseUrl}/api/v1/administrative-documents/${administrativeDocument.id}/validate`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ revisionId }),
      });
      expect(validateRes.status).toBe(200);

      // Le dossier V2 est construit APRÈS la validation admin — la pièce entre donc réellement dans
      // le PackageArtifact V2 (comme n'importe quel dossier réel, F3/F3.1).
      const v2 = await seedResponsePackageV2({ tenderId });

      const createPackageRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(createPackageRes.status).toBe(201);
      const pkg = (await createPackageRes.json()) as { id: string; files: readonly { archivePath: string; sourceType: string; sourceId?: string }[] };

      // Checkpoint TENDEROS-2.1-P2.2-F4.1 — plus AUCUNE reconstruction indépendante : le wrapper ne
      // produit plus jamais de source ADMINISTRATIVE_DOCUMENT, uniquement l'artefact V2 embarqué.
      expect(pkg.files.some((f) => f.sourceType === "ADMINISTRATIVE_DOCUMENT")).toBe(false);
      const v2Entry = pkg.files.find((f) => f.sourceType === "RESPONSE_PACKAGE_ARTIFACT");
      expect(v2Entry?.sourceId).toBe(v2.responsePackageVersionId);

      // La pièce administrative reste bien PRÉSENTE — mais uniquement à l'intérieur du dossier V2
      // embarqué, jamais comme une seconde source indépendante recréée par ce use case.
      const downloadRes = await fetch(`${baseUrl}/api/v1/packages/${pkg.id}/download`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(downloadRes.status).toBe(200);
      const outerZip = await JSZip.loadAsync(Buffer.from(await downloadRes.arrayBuffer()));
      expect(Object.keys(outerZip.files).some((p) => p.startsWith("administratif/"))).toBe(false);
      const v2Path = Object.keys(outerZip.files).find((p) => p.startsWith("dossier-reponse-v2/") && !p.endsWith("/"))!;
      const nestedV2Zip = await JSZip.loadAsync(await outerZip.file(v2Path)!.async("nodebuffer"));
      const nestedManifestText = await nestedV2Zip.file("manifest.json")!.async("string");
      const nestedManifest = JSON.parse(nestedManifestText) as { items: readonly { documentId?: string }[] };
      expect(nestedManifest.items.some((i) => i.documentId === uploaded.documentId)).toBe(true);
    });
  });

  describe("signature gate", () => {
    it("blocks packaging while a MANDATORY signature requirement is CONFIRMED but no transaction is VERIFIED yet (422) — even with a genuinely CURRENT V2 dossier (signature gate stays independently authoritative)", async () => {
      const { tenderId } = await seedApprovedTender(ownerAUserId);
      await seedResponsePackageV2({ tenderId });
      await prisma.signatureRequirement.create({
        data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientAId, tenderId, documentRef: "Acte d'engagement", mandatory: true, status: "CONFIRMED", createdBy: ownerAUserId },
      });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("PACKAGE_NOT_READY");
    });

    /** Checkpoint TENDEROS-2.1-P2.2-F5 (audit) — un `SignatureTransaction` porte sur un
     *  `ExportArtifact` FINAL figé, jamais sur le dossier V2 (mission "structurellement couplé aux
     *  artefacts d'Export"). Un cycle Réouverture -> nouvelle FinalApproval -> nouvel export FINAL
     *  ne touche jamais aux transactions déjà VERIFIED de l'ancien export — sans le filtre ajouté
     *  par ce checkpoint, une signature authentifiant l'ANCIEN export aurait pu accompagner
     *  silencieusement un dépôt bâti autour d'un export MATÉRIELLEMENT différent. */
    it("a signature VERIFIED against a since-superseded export artifact never satisfies the gate for a package built around the NEW export artifact (422, fail closed)", async () => {
      const { tenderId } = await seedApprovedTender(ownerAUserId);
      await seedResponsePackageV2({ tenderId });

      const oldApproval = await prisma.finalApproval.findFirstOrThrow({ where: { organizationId: orgAId, tenderId } });
      await prisma.signatureRequirement.create({
        data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientAId, tenderId, documentRef: "Acte d'engagement", mandatory: true, status: "CONFIRMED", createdBy: ownerAUserId },
      });
      const staleTransactionId = randomUUID();
      await prisma.signatureTransaction.create({
        data: {
          id: staleTransactionId,
          organizationId: orgAId,
          clientAccountId: clientAId,
          tenderId,
          exportArtifactId: (await prisma.exportArtifact.findFirstOrThrow({ where: { organizationId: orgAId, exportJobId: oldApproval.exportJobId } })).id,
          provider: "FAKE",
          status: "VERIFIED",
          documentHash: FILE_HASH,
          createdBy: ownerAUserId,
        },
      });
      await prisma.signatureArtifact.create({
        data: {
          id: randomUUID(),
          organizationId: orgAId,
          signatureTransactionId: staleTransactionId,
          kind: "SIGNED_DOCUMENT",
          fileName: "acte-signe-old.pdf",
          mimeType: "application/pdf",
          fileSize: 10,
          fileHash: "d".repeat(64),
          storageKey: "signatures/fixture-old.pdf",
          verificationStatus: "VERIFIED",
        },
      });

      // Réouverture -> nouveau cycle export/approbation (mission "jamais un dépôt qui mélange la
      // preuve de signature d'un export avec le contenu d'un autre") — même recette que
      // `seedApprovedTender`, un second `ExportJob`/`ExportArtifact`/`FinalApproval`, l'ancienne
      // approbation désactivée.
      await prisma.finalApproval.update({ where: { id: oldApproval.id }, data: { status: "INVALIDATED", invalidatedAt: new Date(), invalidatedReason: "Réouverture (fixture F5)" } });
      const newExportJobId = randomUUID();
      const newStorageKey = `exports/${orgAId}/${tenderId}/${newExportJobId}.pdf`;
      await prisma.exportJob.create({
        data: {
          id: newExportJobId,
          organizationId: orgAId,
          clientAccountId: clientAId,
          tenderId,
          exportTemplateId: (await prisma.exportTemplate.findFirstOrThrow({ where: { organizationId: orgAId } })).id,
          exportTemplateVersionId: (await prisma.exportTemplateVersion.findFirstOrThrow({ where: { organizationId: orgAId } })).id,
          documentType: "TECHNICAL_MEMO",
          mode: "FINAL",
          format: "PDF",
          status: "COMPLETED",
          version: 2,
          createdBy: ownerAUserId,
        },
      });
      const newFileHash = computeSha256(Buffer.from("%PDF-1.4 nouveau mémoire technique après réouverture"));
      await prisma.exportArtifact.create({
        data: {
          id: randomUUID(),
          organizationId: orgAId,
          exportJobId: newExportJobId,
          fileName: "memoire-technique-v2.pdf",
          mimeType: "application/pdf",
          fileSize: 10,
          fileHash: newFileHash,
          storageKey: newStorageKey,
          manifestJson: {},
        },
      });
      const storageProvider = app.get<StorageProvider>(STORAGE_PROVIDER);
      await storageProvider.put({ key: newStorageKey, content: Readable.from(Buffer.from("%PDF-1.4 nouveau mémoire technique après réouverture")), contentType: "application/pdf", sizeBytes: 10 });
      const newValidationRunId = randomUUID();
      await prisma.validationRun.create({ data: { id: newValidationRunId, organizationId: orgAId, clientAccountId: clientAId, tenderId, exportJobId: newExportJobId, readinessStatus: "READY_FOR_APPROVAL", runBy: ownerAUserId } });
      await prisma.finalApproval.create({
        data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientAId, tenderId, exportJobId: newExportJobId, validationRunId: newValidationRunId, manifestHash: newFileHash, approvedBy: ownerAUserId, approverRole: "OWNER" },
      });

      // Le package embarque désormais le NOUVEL export — la transaction VERIFIED de l'ANCIEN export
      // ne le satisfait plus : refus propre, jamais une signature orpheline incluse silencieusement.
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("PACKAGE_NOT_READY");
    }, 30000);
  });

  describe("Checkpoint TENDEROS-2.1-P2.2-F4.1 — Response Package V2 gate", () => {
    it("TEST 1 (GLOBAL HAPPY PATH) — refuses packaging when no submittable Response Package V2 dossier is resolved yet (422 PACKAGE_NOT_READY)", async () => {
      const { tenderId } = await seedApprovedTender(ownerAUserId);
      // Aucun `seedResponsePackageV2` ici — le Tender a une FinalApproval legacy mais AUCUN dossier
      // V2 résolu (mission §1 "le dossier certifié par readiness doit être le dossier qui alimente
      // le dépôt" — plus aucun package legacy ne peut être créé sans lui, même avec le legacy prêt).
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("PACKAGE_NOT_READY");
    });

    it("TEST 3 (OLD LEGACY PACKAGE REJECTED) — a package created against V2 dossier A is refused for deposit once the Tender's V2 dossier has moved to B (rebuild), even though the legacy package itself is still COMPLETED", async () => {
      const { tenderId } = await seedApprovedTender(ownerAUserId);
      const v2A = await seedResponsePackageV2({ tenderId });

      const createPackageRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(createPackageRes.status).toBe(201);
      const pkgA = (await createPackageRes.json()) as { id: string; responsePackageVersionId?: string };
      expect(pkgA.responsePackageVersionId).toBe(v2A.responsePackageVersionId);

      // Rebuild V2 : un nouveau document remplace l'ancien sur le MÊME item checklist — B devient
      // CURRENT, A devient STALE (même mécanique que `response-package-http.integration.spec.ts`).
      const docB = await uploadDocument("piece-v2-b.pdf");
      await prisma.tenderChecklistItem.updateMany({ where: { organizationId: orgAId, tenderId }, data: { matchedDocumentId: docB.documentId, matchedDocumentVersionId: docB.documentVersionId } });
      const buildBRes = await fetch(`${baseUrl}/api/v1/response-packages/${v2A.responsePackageId}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(buildBRes.status).toBe(201);
      const builtB = (await buildBRes.json()) as { version: { id: string } };
      await fetch(`${baseUrl}/api/v1/response-packages/${v2A.responsePackageId}/versions/${builtB.version.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      await fetch(`${baseUrl}/api/v1/response-packages/${v2A.responsePackageId}/versions/${builtB.version.id}/generate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });

      // Tenter de DÉPOSER avec le package A (COMPLETED, mais lié au V2 A désormais obsolète) doit
      // être refusé, même si un dépôt DIRECT (readiness) n'est pas ce qui est testé ici : c'est
      // `resolveExactPackage` lui-même qui doit refuser — prouvé via `start()`.
      const startRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions/start`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: pkgA.id, platform: "PLACE" }),
      });
      expect(startRes.status).toBe(422);
      const startBody = (await startRes.json()) as { error: { code: string } };
      expect(startBody.error.code).toBe("SUBMISSION_PACKAGE_OUTDATED");
    }, 30000);

    it("TEST 5 (CANDIDATE RACE) — a wrapper created while Candidate A is assigned is refused for deposit once the Tender's Candidate changes to B, even though nothing was rebuilt", async () => {
      const { tenderId } = await seedApprovedTender(ownerAUserId);
      const candidateA = await prisma.candidateCompany.create({ data: { id: randomUUID(), organizationId: orgAId, name: "CANDIDAT A F4.1", nameNormalized: "candidat a f4.1", status: "ACTIVE", createdBy: ownerAUserId } });
      const candidateB = await prisma.candidateCompany.create({ data: { id: randomUUID(), organizationId: orgAId, name: "CANDIDAT B F4.1", nameNormalized: "candidat b f4.1", status: "ACTIVE", createdBy: ownerAUserId } });
      await prisma.tender.update({ where: { id: tenderId }, data: { candidateCompanyId: candidateA.id } });

      const v2 = await seedResponsePackageV2({ tenderId });
      const createPackageRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(createPackageRes.status).toBe(201);
      const pkg = (await createPackageRes.json()) as { id: string };

      // Le Tender change de candidat — AUCUN rebuild du dossier V2 (mission §5 TEST — "même sans
      // qu'un rebuild n'ait eu lieu").
      await prisma.tender.update({ where: { id: tenderId }, data: { candidateCompanyId: candidateB.id } });

      const startRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions/start`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: pkg.id, platform: "PLACE" }),
      });
      expect(startRes.status).toBe(422);
      const body = (await startRes.json()) as { error: { code: string } };
      expect(body.error.code).toBe("SUBMISSION_PACKAGE_OUTDATED");
      void v2;
    }, 30000);

    /** TEST 9 (HISTORICAL IMMUTABILITY) — scope volontairement le wrapper lui-même (mission §12
     *  "aucune réécriture d'un ancien... aucun backfill inventé"), jamais le flux complet de dépôt
     *  `POST /submissions` : ce dernier exige la Submission Readiness COMPLÈTE (Candidate/Analyse/
     *  Checklist/GO-NO-GO/Validation — mission §9, chaîne INCHANGÉE par F4.1, déjà exhaustivement
     *  prouvée par `submission-http.integration.spec.ts`, notamment sa propre preuve d'immutabilité
     *  "TEST HISTORICAL PROVENANCE"), qu'un fixture minimal centré sur le wrapper ne construit pas
     *  volontairement (hors périmètre de CE test). La garantie spécifique à F4.1 est que le WRAPPER
     *  (`SubmissionPackage`) — sa provenance V2 stampée à la création — ne change jamais après coup,
     *  même quand le dossier V2 qu'il référençait est ensuite reconstruit. */
    it("TEST 9 (HISTORICAL IMMUTABILITY) — a wrapper's stamped V2 provenance never changes after the Tender's V2 dossier is later rebuilt", async () => {
      const { tenderId } = await seedApprovedTender(ownerAUserId);
      const v2A = await seedResponsePackageV2({ tenderId });
      const createPackageRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(createPackageRes.status).toBe(201);
      const pkgA = (await createPackageRes.json()) as { id: string; responsePackageVersionId?: string; responsePackageArtifactChecksum?: string };
      expect(pkgA.responsePackageVersionId).toBe(v2A.responsePackageVersionId);
      expect(pkgA.responsePackageArtifactChecksum).toBe(v2A.artifactChecksum);

      // Rebuild V2 vers B — jamais un nouveau dépôt ici, seulement une régénération du dossier.
      const docB = await uploadDocument("piece-v2-historical-b.pdf");
      await prisma.tenderChecklistItem.updateMany({ where: { organizationId: orgAId, tenderId }, data: { matchedDocumentId: docB.documentId, matchedDocumentVersionId: docB.documentVersionId } });
      const buildBRes = await fetch(`${baseUrl}/api/v1/response-packages/${v2A.responsePackageId}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      const builtB = (await buildBRes.json()) as { version: { id: string } };
      await fetch(`${baseUrl}/api/v1/response-packages/${v2A.responsePackageId}/versions/${builtB.version.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      await fetch(`${baseUrl}/api/v1/response-packages/${v2A.responsePackageId}/versions/${builtB.version.id}/generate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });

      // Le wrapper A lui-même reste figé — jamais réécrit, toujours A, même si B est désormais CURRENT.
      const pkgAReread = await fetch(`${baseUrl}/api/v1/packages/${pkgA.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(pkgAReread.status).toBe(200);
      const pkgARereadBody = (await pkgAReread.json()) as { responsePackageVersionId?: string; responsePackageArtifactChecksum?: string };
      expect(pkgARereadBody.responsePackageVersionId).toBe(v2A.responsePackageVersionId);
      expect(pkgARereadBody.responsePackageArtifactChecksum).toBe(v2A.artifactChecksum);
    }, 30000);

    /** TEST 10 (MULTI-LOT, resserré par Checkpoint TENDEROS-2.1-P2.2-F4.1-CODEX-AUDIT) — l'audit
     *  indépendant a relevé (P1) que refuser purement et simplement tout Tender N≥2 était une
     *  régression par rapport à F2.3, qui avait déjà résolu ce cas côté `TenderSubmission`
     *  (`responsePackages[]`). Chaque lot requis n'est jamais ambigu individuellement (un seul
     *  `PackageArtifact` par lot) — le wrapper embarque désormais CHAQUE artefact comme entrée ZIP
     *  imbriquée namespacée par lot, avec une provenance par lot (mirroir exact de
     *  `SubmissionResponsePackage`), jamais une concaténation ambiguë ni un choix arbitraire d'un
     *  seul lot. */
    it("TEST 10 (MULTI-LOT, resserré Codex-audit) — a Tender requiring multiple lot-specific Response Package V2 dossiers embeds BOTH artifacts, one provenance row per lot, never an arbitrary single-lot choice", async () => {
      const { tenderId } = await seedApprovedTender(ownerAUserId);
      const lotA = await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId, lotNumber: "1", title: "Lot A", displayOrder: 0 } });
      const lotB = await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId, lotNumber: "2", title: "Lot B", displayOrder: 1 } });

      const perLot = new Map<string, { versionId: string; artifactId: string; checksum: string }>();
      for (const lot of [lotA, lotB]) {
        const doc = await uploadDocument(`piece-lot-${lot.lotNumber}.pdf`);
        await prisma.tenderChecklistItem.create({
          data: {
            id: randomUUID(),
            organizationId: orgAId,
            tenderId,
            lotId: lot.id,
            title: `Pièce lot ${lot.lotNumber}`,
            status: "TODO",
            type: "ADMINISTRATIVE_DOCUMENT",
            requirementLevel: "MANDATORY",
            subjectType: "CANDIDATE",
            complianceStatus: "TO_REVIEW",
            documentStatus: "AVAILABLE",
            matchedDocumentId: doc.documentId,
            matchedDocumentVersionId: doc.documentVersionId,
            documentMatchStatus: "MANUALLY_ATTACHED",
          },
        });
        const createRpRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId: lot.id }) });
        const rp = (await createRpRes.json()) as { id: string };
        const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${rp.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
        const built = (await buildRes.json()) as { version: { id: string } };
        await fetch(`${baseUrl}/api/v1/response-packages/${rp.id}/versions/${built.version.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
        const generateRes = await fetch(`${baseUrl}/api/v1/response-packages/${rp.id}/versions/${built.version.id}/generate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
        const artifact = (await generateRes.json()) as { id: string; checksum: string };
        perLot.set(lot.id, { versionId: built.version.id, artifactId: artifact.id, checksum: artifact.checksum });
      }

      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        id: string;
        responsePackageVersionId?: string;
        responsePackages: readonly { lotId: string; responsePackageVersionId: string; responsePackageArtifactId: string; artifactChecksum: string }[];
        files: readonly { archivePath: string; sourceType: string; sourceId?: string; fileHash: string }[];
      };
      // Mode LOT — jamais les 3 champs scalaires (réservés au mode GLOBAL, mission "jamais les deux
      // à la fois").
      expect(body.responsePackageVersionId).toBeUndefined();
      expect(body.responsePackages).toHaveLength(2);
      for (const lot of [lotA, lotB]) {
        const expected = perLot.get(lot.id)!;
        const row = body.responsePackages.find((p) => p.lotId === lot.id);
        expect(row).toEqual({ lotId: lot.id, responsePackageVersionId: expected.versionId, responsePackageArtifactId: expected.artifactId, artifactChecksum: expected.checksum });
      }
      // Négatif explicite — jamais la provenance de A sous la clé B, ou réciproquement.
      const forA = body.responsePackages.find((p) => p.lotId === lotA.id)!;
      const forB = body.responsePackages.find((p) => p.lotId === lotB.id)!;
      expect(forA.responsePackageVersionId).not.toBe(forB.responsePackageVersionId);

      // Les DEUX artefacts sont réellement embarqués comme entrées ZIP séparées, namespacées par lot.
      const v2Entries = body.files.filter((f) => f.sourceType === "RESPONSE_PACKAGE_ARTIFACT");
      expect(v2Entries).toHaveLength(2);
      for (const lot of [lotA, lotB]) {
        const expected = perLot.get(lot.id)!;
        const entry = v2Entries.find((f) => f.archivePath.includes(`/${lot.id}/`));
        expect(entry?.fileHash).toBe(expected.checksum);
      }

      const downloadRes = await fetch(`${baseUrl}/api/v1/packages/${body.id}/download`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(downloadRes.status).toBe(200);
      const arrayBuffer = await downloadRes.arrayBuffer();
      const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer));
      const realFilePaths = Object.keys(zip.files).filter((p) => !p.endsWith("/"));
      for (const lot of [lotA, lotB]) {
        const expected = perLot.get(lot.id)!;
        const path = realFilePaths.find((p) => p.includes(`/${lot.id}/`))!;
        const extracted = await zip.file(path)!.async("nodebuffer");
        expect(computeSha256(extracted)).toBe(expected.checksum);
      }
    }, 30000);

    // TEST 11 (FLOW PARITY, mission §11/§20) — NON re-testé via HTTP ici : `StartTenderSubmissionUseCase`,
    // `RecordTenderSubmissionUseCase` (direct ET recordFromInProgress) et `ReplaceTenderSubmissionUseCase`
    // appellent tous les trois EXACTEMENT la même instance injectée de `SubmissionPackageResolverService`
    // (constat direct par lecture du code, aucun de ces trois use cases n'a été modifié par F4.1 — seul
    // `resolveExactPackage()` lui-même a changé) : la parité est garantie PAR CONSTRUCTION, jamais par
    // trois implémentations indépendantes à maintenir en synchronisation. TEST 3/5/12 exercent déjà ce
    // contrôle via `start()`. `record()`/`replace()` exigent EN PLUS la Submission Readiness complète
    // (Candidate/Analyse/Checklist/GO-NO-GO/Validation — chaîne totalement INCHANGÉE par F4.1, déjà
    // prouvée exhaustivement par `submission-http.integration.spec.ts`, 45 tests) : un fixture minimal
    // centré sur le wrapper ne peut pas isoler le contrôle F4.1 sur ces deux routes sans dupliquer cette
    // preuve déjà existante — délibérément non refait ici (mission "ne duplique pas ce qui est déjà
    // prouvé").

    it("TEST 12 (CROSS TENANT) — org B can never start a deposit using org A's SubmissionPackage id, even a genuinely CURRENT one, from a Tender org B genuinely owns", async () => {
      const { tenderId } = await seedApprovedTender(ownerAUserId);
      await seedResponsePackageV2({ tenderId });
      const createPackageRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      const pkgA = (await createPackageRes.json()) as { id: string };

      // Org B a besoin d'un Tender À ELLE pour atteindre `resolveExactPackage` (le scoping tenant se
      // fait d'abord sur le Tender) — ici on prouve spécifiquement que le `packageId` d'A, une fois
      // la vérification du Tender passée côté B, ne fuite JAMAIS cross-org (`ListSubmissionPackagesUseCase`
      // reste scopé `organizationId`, inchangé par F4.1).
      const clientBId = randomUUID();
      await prisma.clientAccount.create({ data: { id: clientBId, organizationId: orgBId, name: "Client B F4.1", nameNormalized: "client b f4.1", status: "ACTIVE", createdBy: ownerBUserId } });
      const crossTenderId = randomUUID();
      await prisma.tender.create({ data: { id: crossTenderId, organizationId: orgBId, clientAccountId: clientBId, title: "Marché Org B", status: "DRAFT", tags: [], createdBy: ownerBUserId } });

      const startRes = await fetch(`${baseUrl}/api/v1/tenders/${crossTenderId}/submissions/start`, {
        method: "POST",
        headers: authHeaders(tokenOwnerB, orgBId),
        body: JSON.stringify({ packageId: pkgA.id, platform: "PLACE" }),
      });
      expect(startRes.status).toBe(422);
      const body = (await startRes.json()) as { error: { code: string } };
      expect(body.error.code).toBe("SUBMISSION_PACKAGE_MISSING");
    }, 30000);
  });
});
