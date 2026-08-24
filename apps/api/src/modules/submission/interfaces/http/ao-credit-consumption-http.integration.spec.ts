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
import { ACCESS_TOKEN_SERVICE, type AccessTokenService } from "../../../identity/application/ports/access-token.service";
import { GetTenderSubmissionReadinessUseCase } from "../../application/use-cases/get-tender-submission-readiness.use-case";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E9 (AO Credits V2), mission §74/§75 "au moins un test doit passer par
 * le VRAI use case métier terminal, jamais seulement `creditService.consume()`" — preuve HTTP +
 * PostgreSQL réelle que `POST /tenders/:id/submissions` (le point de choc unique déjà identifié dans
 * `RecordTenderSubmissionUseCase`, réutilisé tel quel, AUCUN second moteur créé) débite exactement 1
 * crédit AO par Tender, jamais plus, jamais moins, même sous concurrence réelle.
 *
 * Isolation délibérée, même motif que `abandon-submission-race-http.integration.spec.ts` :
 * `GetTenderSubmissionReadinessUseCase` est substitué (jamais un mock de repository — seulement ce
 * use case applicatif) par une implémentation qui retourne toujours `[]`, pour isoler précisément le
 * mécanisme de crédit AO du calcul de Submission Readiness V2 (8 dimensions), déjà prouvé
 * exhaustivement ailleurs (`submission-http.integration.spec.ts`). `CreateSubmissionPackageUseCase`
 * n'est PAS contourné : ses propres exigences directes (FinalApproval ACTIVE + Response Package V2
 * CURRENT) restent réelles, seedées via la même recette que le fichier ci-dessus.
 *
 * Organisation à ABONNEMENT (jamais Pass) — la branche Pass est déjà prouvée séparément
 * (`billing-invariants.integration.spec.ts` "two truly simultaneous consumeForTender calls" +
 * `abandon-submission-race-http.integration.spec.ts`). Ce fichier cible spécifiquement la branche
 * ledger (compare-and-set + index unique partiel `(organization_id, tender_id) WHERE
 * type='CONSUMPTION'`, `prisma-ao-credit-ledger.repository.ts`).
 */
describe("Submission → AO credit consumption (Checkpoint TENDEROS-2.1-P2.3-E9) — HTTP + PostgreSQL réel", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let accessTokenService: AccessTokenService;

  const orgId = randomUUID();
  const userIds: string[] = [];
  let ownerToken: string;
  let ownerUserId: string;
  let clientAccountId: string;

  async function createActor(email: string): Promise<{ userId: string; token: string }> {
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email, displayName: "AO Credit Consumption HTTP Test", status: "ACTIVE", passwordHash: "not-used-direct-actor-creation" } });
    const sessionId = randomUUID();
    await prisma.session.create({ data: { id: sessionId, userId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
    return { userId, token: accessTokenService.issue({ userId, sessionId }, 3600) };
  }

  function authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${ownerToken}`, "X-Organization-Id": orgId, "Content-Type": "application/json" };
  }
  function authHeadersNoContentType(): Record<string, string> {
    return { Authorization: `Bearer ${ownerToken}`, "X-Organization-Id": orgId };
  }

  /** Force le solde à une valeur EXACTE, sans passer par `GrantMonthlyAoCreditsUseCase` (hors sujet
   *  ici — l'allocation est prouvée ailleurs, `billing-invariants.integration.spec.ts`) : écriture
   *  directe de la ligne `OrganizationAoCreditBalance`, même motif que les fixtures Pass des specs
   *  Submission (manipulation directe de l'état commercial pour isoler le sujet réel). */
  async function setBalance(balance: number): Promise<void> {
    await prisma.organizationAoCreditBalance.upsert({
      where: { organizationId: orgId },
      create: { id: randomUUID(), organizationId: orgId, balance },
      update: { balance },
    });
  }
  async function getBalance(): Promise<number> {
    const row = await prisma.organizationAoCreditBalance.findUnique({ where: { organizationId: orgId } });
    return row?.balance ?? 0;
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
    accessTokenService = moduleRef.get(ACCESS_TOKEN_SERVICE);

    await prisma.organization.create({
      data: { id: orgId, name: "AO Credit Consumption Org HTTP", slug: `ao-credit-consumption-org-http-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
    // Abonnement Starter ACTIF (jamais Pass) — la branche ledger de `ConsumeAoCreditUseCase` exige un
    // abonnement `isEntitled` (ACTIVE/TRIALING), voir son commentaire de classe.
    await prisma.organizationSubscription.create({
      data: { id: randomUUID(), organizationId: orgId, planTier: "STARTER", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
    });

    const owner = await createActor(`ao-credit-owner-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    ownerToken = owner.token;
    ownerUserId = owner.userId;

    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: owner.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgId, name: "Client AO Credit Consumption HTTP", nameNormalized: "client ao credit consumption http", status: "ACTIVE", createdBy: owner.userId },
    });
    clientAccountId = clientAccount.id;
  }, 60000);

  afterAll(async () => {
    await prisma.aoCreditLedgerEntry.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationAoCreditBalance.deleteMany({ where: { organizationId: orgId } });
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
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: orgId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  /** Sème un Tender réellement prêt à être déposé (recette identique à
   *  `seedTenderReadyToSubmitWithReservedPass` de `abandon-submission-race-http.integration.spec.ts`,
   *  MOINS la réservation Pass — cette organisation est couverte par abonnement, jamais un Pass). */
  async function seedReadyToSubmitTender(title: string): Promise<{ tenderId: string; packageId: string }> {
    const tenderId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderId, organizationId: orgId, clientAccountId, title, status: "IN_ANALYSIS", tags: [], createdBy: ownerUserId, submissionDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });

    const lot = await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgId, tenderId, lotNumber: "1", title: "Lot unique", displayOrder: 0 } });

    const docForm = new FormData();
    docForm.append("title", "DC1.pdf");
    docForm.append("origin", "USER_UPLOAD");
    docForm.append("domain", "TENDER");
    docForm.append("file", new Blob([Buffer.from(`contenu reel DC1 (fixture E9 ${title})`)], { type: "application/pdf" }), "DC1.pdf");
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

    const templateId = randomUUID();
    await prisma.exportTemplate.create({ data: { id: templateId, organizationId: orgId, documentType: "TECHNICAL_MEMO", name: `T-${randomUUID()}`, createdBy: ownerUserId } });
    const templateVersionId = randomUUID();
    await prisma.exportTemplateVersion.create({
      data: { id: templateVersionId, organizationId: orgId, exportTemplateId: templateId, version: 1, status: "DRAFT", format: "PDF", config: { sections: [] }, createdBy: ownerUserId },
    });
    const exportJobId = randomUUID();
    const exportContent = Buffer.from(`%PDF-1.4 memoire technique (fixture E9 ${title})`);
    const storageKey = `exports/${orgId}/${tenderId}/${exportJobId}.pdf`;
    await prisma.exportJob.create({
      data: { id: exportJobId, organizationId: orgId, clientAccountId, tenderId, exportTemplateId: templateId, exportTemplateVersionId: templateVersionId, documentType: "TECHNICAL_MEMO", mode: "FINAL", format: "PDF", status: "COMPLETED", version: 1, createdBy: ownerUserId },
    });
    const { computeSha256 } = await import("../../../../shared-kernel/file-hash");
    const fileHash = computeSha256(exportContent);
    await prisma.exportArtifact.create({
      data: { id: randomUUID(), organizationId: orgId, exportJobId, fileName: "memoire-technique.pdf", mimeType: "application/pdf", fileSize: exportContent.length, fileHash, storageKey, manifestJson: {} },
    });
    const { STORAGE_PROVIDER } = await import("../../../documents");
    const { Readable } = await import("node:stream");
    const storageProvider = app.get<{ put(input: { key: string; content: NodeJS.ReadableStream; contentType: string; sizeBytes: number }): Promise<unknown> }>(STORAGE_PROVIDER);
    await storageProvider.put({ key: storageKey, content: Readable.from(exportContent), contentType: "application/pdf", sizeBytes: exportContent.length });

    const validationRunId = randomUUID();
    await prisma.validationRun.create({ data: { id: validationRunId, organizationId: orgId, clientAccountId, tenderId, exportJobId, readinessStatus: "READY_FOR_APPROVAL", runBy: ownerUserId } });
    await prisma.finalApproval.create({
      data: { id: randomUUID(), organizationId: orgId, clientAccountId, tenderId, exportJobId, validationRunId, manifestHash: fileHash, approvedBy: ownerUserId, approverRole: "OWNER" },
    });

    const packageRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders() });
    expect(packageRes.status).toBe(201);
    const pkg = (await packageRes.json()) as { id: string };

    return { tenderId, packageId: pkg.id };
  }

  async function submit(tenderId: string, packageId: string): Promise<Response> {
    return fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ packageId, platform: "PLACE", submittedAt: new Date().toISOString() }),
    });
  }

  it("mission §78 (non-régression DCE) — importer un DCE ne touche JAMAIS le solde de crédits AO", async () => {
    await setBalance(5);
    const tenderId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderId, organizationId: orgId, clientAccountId, title: "DCE non-régression E9", status: "IN_ANALYSIS", tags: [], createdBy: ownerUserId, submissionDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });

    const balanceBefore = await getBalance();
    const dceRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/dce`, { method: "POST", headers: authHeaders() });
    expect(dceRes.status).toBe(201);
    const balanceAfter = await getBalance();

    expect(balanceAfter).toBe(balanceBefore);
    expect(await prisma.aoCreditLedgerEntry.count({ where: { organizationId: orgId, tenderId } })).toBe(0);
  });

  it("BLOQUANT (mission §12/§19/§42/§75) — un dépôt réussi via le VRAI use case terminal débite exactement 1 crédit, jamais plus", async () => {
    await setBalance(3);
    const { tenderId, packageId } = await seedReadyToSubmitTender("Depot simple E9");

    const balanceBefore = await getBalance();
    const res = await submit(tenderId, packageId);
    expect(res.status).toBe(201);
    const balanceAfter = await getBalance();

    expect(balanceAfter).toBe(balanceBefore - 1);
    const consumptionRows = await prisma.aoCreditLedgerEntry.findMany({ where: { organizationId: orgId, tenderId, type: "CONSUMPTION" } });
    expect(consumptionRows).toHaveLength(1);
    expect(consumptionRows[0]?.amount).toBe(-1);
  });

  it("mission §56/§74 — GET /billing/ao-credits/ledger (self-service) reflète le VRAI mouvement de consommation, et reste strictement borné à l'organisation courante", async () => {
    await setBalance(2);
    const { tenderId, packageId } = await seedReadyToSubmitTender("Historique ledger E9");
    const submitRes = await submit(tenderId, packageId);
    expect(submitRes.status).toBe(201);

    const ledgerRes = await fetch(`${baseUrl}/api/v1/billing/ao-credits/ledger`, { headers: authHeaders() });
    expect(ledgerRes.status).toBe(200);
    const ledgerBody = (await ledgerRes.json()) as { items: Array<{ organizationId: string; type: string; tenderId?: string }>; nextCursor: string | null };
    expect(ledgerBody.items.every((entry) => entry.organizationId === orgId)).toBe(true);
    expect(ledgerBody.items.some((entry) => entry.type === "CONSUMPTION" && entry.tenderId === tenderId)).toBe(true);

    // Cross-tenant (mission §47) — une organisation distincte, sans membership sur `orgId`, ne peut
    // jamais lire cet historique en substituant l'en-tête `X-Organization-Id`, même motif que
    // `OrganizationMembershipGuard` déjà éprouvé ailleurs (E7) : jamais un second mécanisme réinventé
    // ici, seulement une preuve que CE endpoint précis en hérite bien.
    const otherOrgId = randomUUID();
    await prisma.organization.create({
      data: { id: otherOrgId, name: "AO Credit Ledger Cross-Tenant Org", slug: `ao-credit-ledger-cross-tenant-${otherOrgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
    try {
      const crossTenantRes = await fetch(`${baseUrl}/api/v1/billing/ao-credits/ledger`, {
        headers: { Authorization: `Bearer ${ownerToken}`, "X-Organization-Id": otherOrgId, "Content-Type": "application/json" },
      });
      expect(crossTenantRes.status).toBe(404);
    } finally {
      await prisma.organization.deleteMany({ where: { id: otherOrgId } });
    }
  });

  it("BLOQUANT (mission §16/§22 — CRITIQUE, deux AO pour le dernier crédit) — Promise.all sur DEUX Tenders différents contre un solde=1 via le VRAI endpoint : exactement un dépôt réussit, jamais les deux, jamais un solde négatif", async () => {
    await setBalance(1);
    const tenderA = await seedReadyToSubmitTender("Course dernier credit A");
    const tenderB = await seedReadyToSubmitTender("Course dernier credit B");

    const [resA, resB] = await Promise.all([submit(tenderA.tenderId, tenderA.packageId), submit(tenderB.tenderId, tenderB.packageId)]);

    const statuses = [resA.status, resB.status].sort();
    // L'un des deux dépôts réussit (201), l'autre est refusé proprement pour crédit insuffisant (402,
    // `INSUFFICIENT_AO_CREDITS` — `SubmissionErrorFilter`), jamais les deux 201, jamais un crash.
    expect(statuses).toEqual([201, 402]);

    const finalBalance = await getBalance();
    expect(finalBalance).toBe(0);
    expect(finalBalance).toBeGreaterThanOrEqual(0);

    const consumptionRows = await prisma.aoCreditLedgerEntry.count({ where: { organizationId: orgId, type: "CONSUMPTION", tenderId: { in: [tenderA.tenderId, tenderB.tenderId] } } });
    expect(consumptionRows).toBe(1);

    const submissionRows = await prisma.tenderSubmission.count({ where: { organizationId: orgId, tenderId: { in: [tenderA.tenderId, tenderB.tenderId] } } });
    expect(submissionRows).toBe(1);

    // Mission §18 — le Tender perdant n'est JAMAIS supprimé/corrompu : il existe toujours, avec son
    // statut d'origine, prêt à être redéposé dès qu'un nouveau crédit est disponible.
    const winnerTenderId = resA.status === 201 ? tenderA.tenderId : tenderB.tenderId;
    const loserTenderId = winnerTenderId === tenderA.tenderId ? tenderB.tenderId : tenderA.tenderId;
    const loserTender = await prisma.tender.findUniqueOrThrow({ where: { id: loserTenderId } });
    expect(loserTender.status).toBe("IN_ANALYSIS");
  });

  it("mission §15/§21/§43 (double-clic / retry) — Promise.all de DEUX dépôts concurrents pour LE MÊME Tender ne débite jamais deux fois, quelle que soit l'issue HTTP de la requête perdante", async () => {
    await setBalance(5);
    const { tenderId, packageId } = await seedReadyToSubmitTender("Double clic meme tender E9");

    const balanceBefore = await getBalance();
    const [resA, resB] = await Promise.allSettled([submit(tenderId, packageId), submit(tenderId, packageId)]);

    // Les deux appels HTTP doivent toujours ABOUTIR (jamais un timeout/hang), et la requête
    // perdante doit recevoir un code d'erreur PROPRE (409 CONCURRENT_AO_CREDIT_LEDGER_WRITE),
    // jamais une exception Postgres brute qui fuit en 500 (correctif P1 E9, trouvé par CE test).
    expect(resA.status).toBe("fulfilled");
    expect(resB.status).toBe("fulfilled");
    const httpStatuses = [resA, resB].map((r) => (r as PromiseFulfilledResult<Response>).value.status).sort();
    expect(httpStatuses).toEqual([201, 409]);

    const finalBalance = await getBalance();
    // Invariant ABSOLU, quel que soit le code HTTP réel de la requête perdante : au plus 1 crédit
    // débité pour ce Tender, jamais un double débit silencieux.
    expect(finalBalance).toBe(balanceBefore - 1);
    expect(finalBalance).toBeGreaterThanOrEqual(0);

    const consumptionRows = await prisma.aoCreditLedgerEntry.findMany({ where: { organizationId: orgId, tenderId, type: "CONSUMPTION" } });
    expect(consumptionRows).toHaveLength(1);

    const submissionRows = await prisma.tenderSubmission.findMany({ where: { organizationId: orgId, tenderId } });
    expect(submissionRows).toHaveLength(1);
  });
});
