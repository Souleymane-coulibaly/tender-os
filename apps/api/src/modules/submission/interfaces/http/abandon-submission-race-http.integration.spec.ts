import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { computeSha256 } from "../../../../shared-kernel/file-hash";
import { STORAGE_PROVIDER, type StorageProvider } from "../../../documents";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { GetTenderSubmissionReadinessUseCase } from "../../application/use-cases/get-tender-submission-readiness.use-case";

const EXPORT_ARTIFACT_CONTENT = Buffer.from("%PDF-1.4 memoire technique (fixture P2.3-E1.5 race)");
const FILE_HASH = computeSha256(EXPORT_ARTIFACT_CONTENT);

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1.5, mission §2 (RACE PRODUIT OBLIGATOIRE, TEST F/G/H) — reproduit
 * contre PostgreSQL RÉEL la course entre `POST /tenders/:id/abandon` et
 * `POST /tenders/:id/submissions` pour un MÊME Tender A dont le Pass P1 est RESERVED(A) (organisation
 * Pass-only, jamais un abonnement — même motif que `abandon-tender-http.integration.spec.ts`).
 *
 * Isolation délibérée : ce fichier n'exerce PAS les 8 dimensions de la Submission Readiness V2
 * (Candidate/Analyse/Checklist/GoNoGo/Mémoire technique/Administratif/Validation/Response Package) —
 * elles sont déjà prouvées exhaustivement ailleurs (`submission-http.integration.spec.ts`, `seedReadyDossier`)
 * et sont ORTHOGONALES au sujet précis de ce Checkpoint (la course Abandon/Pass/Submission). Le sujet
 * réel — `RecordTenderSubmissionUseCase` refuse un Tender Archived (mission §3) et ne laisse jamais un
 * Pass AVAILABLE cohabiter avec une Submission enregistrée (mission §2) — est totalement indépendant
 * du calcul de readiness lui-même. `GetTenderSubmissionReadinessUseCase` est donc substitué
 * (`overrideProvider`, jamais un mock de repository — mission §2 "ne pas mocker les repositories" ne
 * s'applique qu'aux repositories) par une implémentation qui retourne toujours `[]` (aucune raison
 * bloquante), pour isoler précisément le mécanisme sous test. `CreateSubmissionPackageUseCase` (le
 * package legacy que la Submission référence) N'EST PAS contourné : ses PROPRES exigences directes
 * (FinalApproval ACTIVE + Response Package V2 résolu et CURRENT) restent réelles, seedées via les
 * mêmes recettes déjà établies (`seedApprovedTender`/`seedReadyDossier` de
 * `submission-http.integration.spec.ts`).
 */
describe("Submission — abandon/submission race (Checkpoint TENDEROS-2.1-P2.3-E1.5, mission §2) — HTTP + PostgreSQL réel", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const userIds: string[] = [];
  let ownerToken: string;
  let ownerUserId: string;
  let clientAccountId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Abandon Submission Race HTTP Test", termsAccepted: true }),
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

  function authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${ownerToken}`, "X-Organization-Id": orgId, "Content-Type": "application/json" };
  }
  function authHeadersNoContentType(): Record<string, string> {
    return { Authorization: `Bearer ${ownerToken}`, "X-Organization-Id": orgId };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GetTenderSubmissionReadinessUseCase)
      .useValue({ resolveFileReadinessReasons: async () => [] })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleRef.get(PrismaService);

    // Organisation Pass-only — AUCUN abonnement seedé (même motif que
    // `abandon-tender-http.integration.spec.ts`), pour exercer la VRAIE branche Pass de l'entitlement
    // et prouver l'invariant du Pass, pas seulement celui du crédit ledger.
    await prisma.organization.create({
      data: { id: orgId, name: "Abandon Submission Race Org HTTP", slug: `abandon-submission-race-org-http-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });

    const owner = await registerAndLogin(`abandon-submission-race-owner-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    ownerToken = owner.token;
    ownerUserId = owner.userId;

    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: owner.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgId, name: "Client Abandon Submission Race HTTP", nameNormalized: "client abandon submission race http", status: "ACTIVE", createdBy: owner.userId },
    });
    clientAccountId = clientAccount.id;
  }, 60000);

  afterAll(async () => {
    await prisma.submissionProof.deleteMany({ where: { organizationId: orgId } });
    await prisma.tenderSubmission.deleteMany({ where: { organizationId: orgId } });
    await prisma.packageFile.deleteMany({ where: { organizationId: orgId } });
    await prisma.submissionPackage.deleteMany({ where: { organizationId: orgId } });
    await prisma.finalApproval.deleteMany({ where: { organizationId: orgId } });
    await prisma.validationRun.deleteMany({ where: { organizationId: orgId } });
    await prisma.exportArtifact.deleteMany({ where: { organizationId: orgId } });
    await prisma.exportJob.deleteMany({ where: { organizationId: orgId } });
    await prisma.exportTemplate.deleteMany({ where: { organizationId: orgId } });
    await prisma.packageArtifact.deleteMany({ where: { organizationId: orgId } });
    await prisma.packageItem.deleteMany({ where: { organizationId: orgId } });
    await prisma.responsePackageVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.responsePackage.deleteMany({ where: { organizationId: orgId } });
    await prisma.tenderChecklistItem.deleteMany({ where: { organizationId: orgId } });
    await prisma.tenderLot.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.document.deleteMany({ where: { organizationId: orgId } });
    await prisma.dceDocument.deleteMany({ where: { organizationId: orgId } });
    await prisma.dce.deleteMany({ where: { organizationId: orgId } });
    await prisma.tenderStatusHistoryEntry.deleteMany({ where: { organizationId: orgId } });
    await prisma.tender.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationPassPurchase.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  /** Sème un Tender A, entitlement UNIQUEMENT via un Pass RESERVED(A) réel (déclenché par un VRAI
   *  point d'entrée gaté, `POST .../dce`, jamais une manipulation directe de `status` en base — même
   *  motif que `abandon-tender-http.integration.spec.ts`), avec un package de dépôt COMPLETED réel
   *  (chaîne FinalApproval + Response Package V2 minimal, recette allégée de `seedReadyDossier` de
   *  `submission-http.integration.spec.ts` — Candidate/Analyse/Checklist-réconciliation/Validation
   *  HTTP volontairement absents, hors sujet de ce Checkpoint, voir la docstring de fichier). */
  async function seedTenderReadyToSubmitWithReservedPass(): Promise<{ tenderId: string; passId: string; packageId: string }> {
    const tenderId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderId, organizationId: orgId, clientAccountId, title: "Marche Abandon Submission Race HTTP", status: "IN_ANALYSIS", tags: [], createdBy: ownerUserId, submissionDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });

    const pass = await prisma.organizationPassPurchase.create({
      data: { id: randomUUID(), organizationId: orgId, status: "AVAILABLE", externalReference: `cs_test_${randomUUID()}`, priceCents: 9900, currency: "EUR" },
    });

    // Réserve RÉELLEMENT le Pass pour ce Tender via une VRAIE opération cœur AO déjà gatée (E1.1).
    const dceRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/dce`, { method: "POST", headers: authHeaders() });
    expect(dceRes.status).toBe(201);
    const reserved = await prisma.organizationPassPurchase.findUniqueOrThrow({ where: { id: pass.id } });
    expect(reserved.status).toBe("RESERVED");
    expect(reserved.reservedTenderId).toBe(tenderId);

    // Response Package V2 minimal — un Lot, un item MANDATORY satisfait par un document réel.
    const lot = await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgId, tenderId, lotNumber: "1", title: "Lot unique", displayOrder: 0 } });

    const docForm = new FormData();
    docForm.append("title", "DC1.pdf");
    docForm.append("origin", "USER_UPLOAD");
    docForm.append("domain", "TENDER");
    docForm.append("file", new Blob([Buffer.from("contenu reel DC1 (fixture E1.5 race)")], { type: "application/pdf" }), "DC1.pdf");
    const docRes = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: authHeadersNoContentType(), body: docForm });
    expect(docRes.status).toBe(201);
    const doc = (await docRes.json()) as { id: string; currentVersion: { id: string } };

    await prisma.tenderChecklistItem.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        tenderId,
        lotId: lot.id,
        title: "DC1",
        status: "TODO",
        type: "ADMINISTRATIVE_DOCUMENT",
        requirementLevel: "MANDATORY",
        subjectType: "CANDIDATE",
        complianceStatus: "TO_REVIEW",
        documentStatus: "AVAILABLE",
        matchedDocumentId: doc.id,
        matchedDocumentVersionId: doc.currentVersion.id,
        documentMatchStatus: "MANUALLY_ATTACHED",
      },
    });

    const createRpRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ lotId: lot.id }) });
    expect(createRpRes.status).toBe(201);
    const rp = (await createRpRes.json()) as { id: string };
    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${rp.id}/build`, { method: "POST", headers: authHeaders() });
    expect(buildRes.status).toBe(201);
    const built = (await buildRes.json()) as { version: { id: string } };
    const validateRes = await fetch(`${baseUrl}/api/v1/response-packages/${rp.id}/versions/${built.version.id}/validate`, { method: "POST", headers: authHeaders() });
    expect(validateRes.status).toBe(200);
    const generateRes = await fetch(`${baseUrl}/api/v1/response-packages/${rp.id}/versions/${built.version.id}/generate`, { method: "POST", headers: authHeaders() });
    expect(generateRes.status).toBe(201);

    // FinalApproval ACTIVE (exigence DIRECTE de `CreateSubmissionPackageUseCase`, indépendante de la
    // Submission Readiness) — seedée directement en base, même recette que `seedApprovedTender` de
    // `submission-http.integration.spec.ts` (le flux HTTP réel `/validation/run` est déjà prouvé
    // ailleurs, hors sujet ici).
    const templateId = randomUUID();
    await prisma.exportTemplate.create({ data: { id: templateId, organizationId: orgId, documentType: "TECHNICAL_MEMO", name: `T-${randomUUID()}`, createdBy: ownerUserId } });
    const templateVersionId = randomUUID();
    await prisma.exportTemplateVersion.create({
      data: { id: templateVersionId, organizationId: orgId, exportTemplateId: templateId, version: 1, status: "DRAFT", format: "PDF", config: { sections: [] }, createdBy: ownerUserId },
    });
    const exportJobId = randomUUID();
    const storageKey = `exports/${orgId}/${tenderId}/${exportJobId}.pdf`;
    await prisma.exportJob.create({
      data: { id: exportJobId, organizationId: orgId, clientAccountId, tenderId, exportTemplateId: templateId, exportTemplateVersionId: templateVersionId, documentType: "TECHNICAL_MEMO", mode: "FINAL", format: "PDF", status: "COMPLETED", version: 1, createdBy: ownerUserId },
    });
    await prisma.exportArtifact.create({
      data: { id: randomUUID(), organizationId: orgId, exportJobId, fileName: "memoire-technique.pdf", mimeType: "application/pdf", fileSize: EXPORT_ARTIFACT_CONTENT.length, fileHash: FILE_HASH, storageKey, manifestJson: {} },
    });
    const storageProvider = app.get<StorageProvider>(STORAGE_PROVIDER);
    await storageProvider.put({ key: storageKey, content: Readable.from(EXPORT_ARTIFACT_CONTENT), contentType: "application/pdf", sizeBytes: EXPORT_ARTIFACT_CONTENT.length });

    const validationRunId = randomUUID();
    await prisma.validationRun.create({ data: { id: validationRunId, organizationId: orgId, clientAccountId, tenderId, exportJobId, readinessStatus: "READY_FOR_APPROVAL", runBy: ownerUserId } });
    await prisma.finalApproval.create({
      data: { id: randomUUID(), organizationId: orgId, clientAccountId, tenderId, exportJobId, validationRunId, manifestHash: FILE_HASH, approvedBy: ownerUserId, approverRole: "OWNER" },
    });

    const packageRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders() });
    expect(packageRes.status).toBe(201);
    const pkg = (await packageRes.json()) as { id: string };

    return { tenderId, passId: pass.id, packageId: pkg.id };
  }

  it("mission §2 CRITIQUE (TEST F/G/H) — Promise.allSettled([abandon(A), submissions(A)]) against a real Pass RESERVED(A): the DB NEVER converges to Submission recorded + Pass AVAILABLE, nor a Pass reassignable to B", async () => {
    const { tenderId, passId, packageId } = await seedTenderReadyToSubmitWithReservedPass();

    const [abandonSettled, submissionSettled] = await Promise.allSettled([
      fetch(`${baseUrl}/api/v1/tenders/${tenderId}/abandon`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ reason: "Course concurrente E1.5" }) }),
      fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ packageId, platform: "PLACE", submittedAt: new Date().toISOString() }) }),
    ]);

    // Les deux appels HTTP eux-mêmes doivent toujours ABOUTIR proprement (jamais un timeout/hang de
    // deadlock — un seul verrou de ligne est jamais contesté dans plus d'une direction à la fois entre
    // ces deux transactions, voir ARCHITECTURE_AFTER du rapport).
    expect(abandonSettled.status).toBe("fulfilled");
    expect(submissionSettled.status).toBe("fulfilled");
    const abandonRes = (abandonSettled as PromiseFulfilledResult<Response>).value;
    const submissionRes = (submissionSettled as PromiseFulfilledResult<Response>).value;

    const passRow = await prisma.organizationPassPurchase.findUniqueOrThrow({ where: { id: passId } });
    const submissionRow = await prisma.tenderSubmission.findFirst({ where: { organizationId: orgId, tenderId } });
    const tenderRow = await prisma.tender.findUniqueOrThrow({ where: { id: tenderId } });

    // Mission §17 — le Tender est abandonné dans tous les cas réels observables (l'archivage lui-même
    // ne dépend jamais de l'issue de la course sur le Pass).
    expect(abandonRes.status).toBe(200);
    expect(tenderRow.status).toBe("ARCHIVED");

    if (submissionRes.status === 201) {
      // TEST H — la Submission a réellement gagné la course : le Pass DOIT être CONSUMED pour CE
      // Tender précis, JAMAIS AVAILABLE, JAMAIS réassignable à un autre Tender.
      expect(submissionRow).not.toBeNull();
      expect(passRow.status).toBe("CONSUMED");
      expect(passRow.consumedTenderId).toBe(tenderId);
    } else {
      // TEST G — l'abandon a gagné la course (ou la relecture Tender fraîche dans la transaction a
      // intercepté un archivage déjà committé) : AUCUNE Submission n'a été persistée, et le Pass n'est
      // JAMAIS dans un état corrompu — soit encore/à nouveau AVAILABLE (libéré), soit CONSUMED s'il
      // avait déjà été consommé avant que cette relecture n'échoue (jamais les deux vrais en même temps).
      expect(submissionRow).toBeNull();
      expect(["AVAILABLE", "CONSUMED"]).toContain(passRow.status);
    }

    // Invariant absolu, quel que soit le chemin réellement emprunté par Postgres (mission §2, états
    // interdits explicites) :
    if (passRow.status === "AVAILABLE") {
      expect(submissionRow).toBeNull(); // jamais "Submission enregistrée + Pass AVAILABLE"
      expect(passRow.reservedTenderId).toBeNull(); // jamais un Pass à moitié libéré
    }
  });
});
