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
import { PrismaBusinessAnalysisRepository } from "../../../analysis/infrastructure/prisma-business-analysis.repository";
import type { TenderConsolidationOutput } from "../../../analysis/application/schemas/business/tender-consolidation-output.schema";

/**
 * V2 Sprint 6 — Checklist intelligente DCE : preuve réelle contre HTTP + PostgreSQL du parcours
 * complet (manuel + IA), du rapprochement documentaire, et de l'isolation multi-tenant sur les
 * nouvelles routes (`tenders.controller.ts` étendu + `checklist-intelligence` module). Même motif
 * que les autres suites `*-http.integration.spec.ts` de ce dépôt.
 */
describe("Checklist intelligente — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenOwnerB: string;
  let ownerAUserId: string;
  let ownerBUserId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Checklist HTTP Test", termsAccepted: true }),
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

  async function createClientAndTender(input: { organizationId: string; userId: string }): Promise<{ clientAccountId: string; tenderId: string }> {
    const suffix = randomUUID();
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: input.organizationId, name: `Client HTTP ${suffix}`, nameNormalized: `client http ${suffix}`, status: "ACTIVE", createdBy: input.userId },
    });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: input.organizationId, clientAccountId: clientAccount.id, title: "Marche Checklist HTTP", status: "IN_ANALYSIS", tags: [], createdBy: input.userId },
    });
    return { clientAccountId: clientAccount.id, tenderId: tender.id };
  }

  function minimalConsolidationOutput(overrides: Partial<TenderConsolidationOutput> = {}): TenderConsolidationOutput {
    return {
      metadata: {},
      deadlines: [],
      criteria: [],
      requirements: [{ category: "ADMINISTRATIVE", label: "Attestation d'assurance", isMandatory: true, isInferred: false, confidence: 0.8 }],
      clauses: [],
      risks: [],
      questions: [],
      summary: {
        opportunitySummary: "Synthese.",
        complexityLevel: "MEDIUM",
        mainCriteria: [],
        mainRisks: [],
        mainObligations: [],
        missingElements: [],
        pointsToClarify: [],
        conflicts: [],
        goNoGoRecommendation: "GO",
        goNoGoRationale: "Rationale.",
      },
      ...overrides,
    } as TenderConsolidationOutput;
  }

  async function seedSucceededAnalysis(input: { organizationId: string; tenderId: string; actorId: string; output?: TenderConsolidationOutput }): Promise<void> {
    const jobId = randomUUID();
    await prisma.analysisJob.create({
      data: {
        id: jobId,
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        targetId: input.tenderId,
        scope: "TENDER",
        status: "SUCCEEDED",
        analysisVersion: 1,
        promptVersion: 1,
        triggeredByRole: "OWNER",
        updatedAt: new Date(),
      },
    });
    const repository = new PrismaBusinessAnalysisRepository(prisma);
    await prisma.$transaction((tx) =>
      repository.persistTenderConsolidation(tx, {
        organizationId: input.organizationId,
        analysisJobId: jobId,
        analysisVersion: 1,
        tenderId: input.tenderId,
        output: input.output ?? minimalConsolidationOutput(),
        documentVersionsByDocumentId: {},
      }),
    );
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
        { id: orgAId, name: "Checklist Org A HTTP", slug: `checklist-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Checklist Org B HTTP", slug: `checklist-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`checklist-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`checklist-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId);
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;
    ownerAUserId = ownerA.userId;
    ownerBUserId = ownerB.userId;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });
  }, 60000);

  afterAll(async () => {
    await prisma.tenderChecklistItemSource.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderChecklistItem.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.subcontractorProfile.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.aiSuggestion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderRequirementFinding.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderDeadlineFinding.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderCriterionFinding.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderClauseFinding.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderRiskFinding.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderQuestionFinding.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderAnalysisSummary.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.analysisJob.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentTenderAssociation.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.document.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
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

  it("manual flow: create a checklist item, validate it, and see it reflected in progress", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ title: "Fournir attestation URSSAF", type: "ADMINISTRATIVE_DOCUMENT", requirementLevel: "MANDATORY", criticality: "BLOCKING" }),
    });
    expect(createRes.status).toBe(201);
    const item = (await createRes.json()) as { id: string; complianceStatus: string; origin: string };
    expect(item.complianceStatus).toBe("TO_REVIEW");
    expect(item.origin).toBe("MANUAL");

    const validateRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/${item.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(validateRes.status).toBe(200);
    const validated = (await validateRes.json()) as { complianceStatus: string; status: string };
    expect(validated.complianceStatus).toBe("VALIDATED");
    expect(validated.status).toBe("COMPLETED");

    const progressRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/progress`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(progressRes.status).toBe(200);
    const progress = (await progressRes.json()) as { global: { totalApplicable: number; validated: number } };
    expect(progress.global.totalApplicable).toBe(1);
    expect(progress.global.validated).toBe(1);
  });

  it("AI flow: a RequirementFinding maps to a CHECKLIST_ITEM suggestion (never TENDER_REQUESTED_DOCUMENT), and accepting it creates the checklist item", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await seedSucceededAnalysis({ organizationId: orgAId, tenderId, actorId: ownerAUserId });

    const mapRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/analysis/map-suggestions`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(mapRes.status).toBe(200);
    const mapped = (await mapRes.json()) as { createdCount: number };
    expect(mapped.createdCount).toBe(1);

    const listRes = await fetch(`${baseUrl}/api/v1/ai-suggestions?entityType=CHECKLIST_ITEM&parentTenderId=${tenderId}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(listRes.status).toBe(200);
    const suggestions = (await listRes.json()) as { id: string; entityType: string; proposedValue: { title: string; type: string } }[];
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.entityType).toBe("CHECKLIST_ITEM");
    expect(suggestions[0]?.proposedValue.type).toBe("ADMINISTRATIVE_DOCUMENT");

    const requestedDocsRes = await fetch(`${baseUrl}/api/v1/ai-suggestions?entityType=TENDER_REQUESTED_DOCUMENT&parentTenderId=${tenderId}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(((await requestedDocsRes.json()) as unknown[]).length).toBe(0);

    // V2 Sprint 4 — seul `POST /ai-suggestions/:id/apply` (module ai-suggestion-bridge) écrit
    // réellement une donnée métier ; `/accept` (module ai-suggestion générique) ne fait que
    // transitionner le statut de la suggestion elle-même, jamais la cible.
    const acceptRes = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestions[0]!.id}/apply`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) });
    expect(acceptRes.status).toBe(200);

    const listItemsRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const items = (await listItemsRes.json()) as { title: string; origin: string; type: string }[];
    expect(items).toHaveLength(1);
    expect(items[0]?.origin).toBe("AI_SUGGESTION");
    expect(items[0]?.type).toBe("ADMINISTRATIVE_DOCUMENT");
  });

  // Correctif audit Codex P1 — dédoublonnage IA non protégé contre la concurrence : deux
  // AiSuggestion(CHECKLIST_ITEM) DISTINCTES (ex. RC + CCAP décrivant la même exigence, mission
  // §11) décrivant EXACTEMENT le même titre sont acceptées CONCURREMMENT via deux vraies requêtes
  // HTTP parallèles contre le même Postgres. Sans le verrou `pg_advisory_xact_lock` posé dans
  // `CreateChecklistItemUseCase`, les deux transactions liraient chacune "aucune correspondance"
  // avant que l'une n'ait committé, et créeraient deux ChecklistItem au lieu d'un seul avec deux
  // sources — exactement le défaut signalé.
  it("concurrency: two distinct AiSuggestions describing the same requirement, applied in parallel, never create two ChecklistItems (one merges as a second source)", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await seedSucceededAnalysis({
      organizationId: orgAId,
      tenderId,
      actorId: ownerAUserId,
      output: minimalConsolidationOutput({
        requirements: [
          { category: "ADMINISTRATIVE", label: "Attestation RC decennale", isMandatory: true, isInferred: false, confidence: 0.8 },
          { category: "ADMINISTRATIVE", label: "Attestation RC decennale", isMandatory: true, isInferred: false, confidence: 0.75 },
        ],
      }),
    });

    const mapRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/analysis/map-suggestions`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(mapRes.status).toBe(200);
    expect(((await mapRes.json()) as { createdCount: number }).createdCount).toBe(2);

    const listRes = await fetch(`${baseUrl}/api/v1/ai-suggestions?entityType=CHECKLIST_ITEM&parentTenderId=${tenderId}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const suggestions = (await listRes.json()) as { id: string }[];
    expect(suggestions).toHaveLength(2);

    // Deux vraies requêtes HTTP concurrentes — deux transactions Postgres réellement en course,
    // jamais une simulation séquentielle.
    const [firstRes, secondRes] = await Promise.all(
      suggestions.map((suggestion) =>
        fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestion.id}/apply`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) }),
      ),
    );
    expect(firstRes!.status).toBe(200);
    expect(secondRes!.status).toBe(200);

    const itemsRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const items = (await itemsRes.json()) as { id: string; title: string }[];
    const matching = items.filter((item) => item.title === "Attestation RC decennale");
    expect(matching).toHaveLength(1);

    // Les deux provenances sont conservées — jamais une source supprimée (mission §11).
    const sources = await prisma.tenderChecklistItemSource.findMany({ where: { checklistItemId: matching[0]!.id } });
    expect(sources).toHaveLength(2);
  });

  // Correctif audit Codex P2 — sujet sous-traitant insuffisamment validé : preuve réelle contre
  // Postgres (port + adapter, pont @Global() `SubcontractorSubjectValidationBridgeModule`) qu'un
  // `subjectSubcontractorProfileId` inexistant, appartenant à une AUTRE organisation, ou pointant
  // vers un profil ARCHIVÉ, est rejeté (404, jamais distingué — même convention anti-énumération
  // que `TENDER_LOT_MISMATCH`) ; qu'un profil réel et actif de la MÊME organisation est accepté ;
  // et que la cohérence subjectType/subjectSubcontractorProfileId est vérifiée.
  it("subcontractor subject validation: rejects a nonexistent, cross-tenant, or archived subcontractor profile — accepts a real active one", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });

    const activeProfileA = await prisma.subcontractorProfile.create({
      data: { id: randomUUID(), organizationId: orgAId, legalName: "Sous-traitant actif A", status: "ACTIVE", createdBy: ownerAUserId },
    });
    const archivedProfileA = await prisma.subcontractorProfile.create({
      data: { id: randomUUID(), organizationId: orgAId, legalName: "Sous-traitant archive A", status: "ARCHIVED", createdBy: ownerAUserId },
    });
    const profileB = await prisma.subcontractorProfile.create({
      data: { id: randomUUID(), organizationId: orgBId, legalName: "Sous-traitant B", status: "ACTIVE", createdBy: ownerBUserId },
    });

    async function attemptCreate(subcontractorProfileId: string): Promise<Response> {
      return fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ title: "Piece sous-traitant", subjectType: "SUBCONTRACTOR", subjectSubcontractorProfileId: subcontractorProfileId }),
      });
    }

    const nonExistentRes = await attemptCreate(randomUUID());
    expect(nonExistentRes.status).toBe(404);
    expect(((await nonExistentRes.json()) as { error: { code: string } }).error.code).toBe("CHECKLIST_SUBCONTRACTOR_SUBJECT_NOT_FOUND");

    const crossTenantRes = await attemptCreate(profileB.id);
    expect(crossTenantRes.status).toBe(404);
    expect(((await crossTenantRes.json()) as { error: { code: string } }).error.code).toBe("CHECKLIST_SUBCONTRACTOR_SUBJECT_NOT_FOUND");

    const archivedRes = await attemptCreate(archivedProfileA.id);
    expect(archivedRes.status).toBe(404);
    expect(((await archivedRes.json()) as { error: { code: string } }).error.code).toBe("CHECKLIST_SUBCONTRACTOR_SUBJECT_NOT_FOUND");

    // Cohérence du contexte : subjectSubcontractorProfileId n'a de sens que pour subjectType SUBCONTRACTOR.
    const incoherentRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ title: "Piece incoherente", subjectType: "CANDIDATE", subjectSubcontractorProfileId: activeProfileA.id }),
    });
    expect(incoherentRes.status).toBe(422);
    expect(((await incoherentRes.json()) as { error: { code: string } }).error.code).toBe("INVALID_CHECKLIST_SUBJECT");

    // Aucune des tentatives ci-dessus n'a créé le moindre ChecklistItem.
    const listBeforeRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(((await listBeforeRes.json()) as unknown[]).length).toBe(0);

    const validRes = await attemptCreate(activeProfileA.id);
    expect(validRes.status).toBe(201);
    const created = (await validRes.json()) as { subjectType: string; subjectSubcontractorProfileId: string };
    expect(created.subjectType).toBe("SUBCONTRACTOR");
    expect(created.subjectSubcontractorProfileId).toBe(activeProfileA.id);
  });

  it("document matching + attach/detach: never associates silently, always requires an explicit attach call", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const document = await prisma.document.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        title: "Attestation assurance decennale",
        origin: "USER_UPLOAD",
        domain: "TENDER",
        status: "ACTIVE",
        currentVersionNumber: 0,
        createdByUserId: ownerAUserId,
      },
    });
    // ListTenderDocumentsUseCase (module documents) lit via DocumentTenderAssociation, jamais un
    // champ tenderId direct sur Document — sans cette ligne, le document reste invisible au
    // matching bien qu'il appartienne à la même organisation.
    await prisma.documentTenderAssociation.create({
      data: { documentId: document.id, tenderId, organizationId: orgAId, createdByUserId: ownerAUserId },
    });

    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ title: "Attestation assurance decennale", type: "INSURANCE" }),
    });
    const item = (await createRes.json()) as { id: string };

    const matchesRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/${item.id}/document-matches`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(matchesRes.status).toBe(200);
    const matches = (await matchesRes.json()) as { status: string; candidates: { documentId: string }[] };
    expect(matches.candidates.some((candidate) => candidate.documentId === document.id)).toBe(true);

    // Le score seul ne suffit jamais : l'item reste MISSING tant qu'aucun attach explicite.
    const beforeAttachRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const beforeItems = (await beforeAttachRes.json()) as { documentStatus: string }[];
    expect(beforeItems[0]?.documentStatus).toBe("MISSING");

    const attachRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/${item.id}/attach-document`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentId: document.id, matchStatus: matches.status }),
    });
    expect(attachRes.status).toBe(200);
    const attached = (await attachRes.json()) as { documentStatus: string; matchedDocumentId: string };
    expect(attached.documentStatus).toBe("AVAILABLE");
    expect(attached.matchedDocumentId).toBe(document.id);

    const detachRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/${item.id}/document`, { method: "DELETE", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(detachRes.status).toBe(200);
    const detached = (await detachRes.json()) as { documentStatus: string; matchedDocumentId?: string };
    expect(detached.documentStatus).toBe("MISSING");
    expect(detached.matchedDocumentId).toBeUndefined();
  });

  // Correctif audit Codex P1 — `matchedDocumentVersionId` est dénormalisé (aucune FK, voir
  // `schema.prisma`) : preuve réelle contre PostgreSQL qu'une version inexistante, appartenant à
  // un AUTRE document (même organisation), ou à une AUTRE organisation, est rejetée (404), et que
  // le ChecklistItem n'est jamais mutée dans ces trois cas.
  it("attach-document rejects a documentVersionId that does not exist, belongs to a different document, or a different organization", async () => {
    async function createDocumentWithVersion(organizationId: string, userId: string): Promise<{ documentId: string; versionId: string }> {
      const documentId = randomUUID();
      const versionId = randomUUID();
      await prisma.document.create({
        data: { id: documentId, organizationId, title: "Attestation", origin: "USER_UPLOAD", domain: "TENDER", status: "ACTIVE", currentVersionNumber: 1, createdByUserId: userId },
      });
      await prisma.documentVersion.create({
        data: {
          id: versionId,
          organizationId,
          documentId,
          versionNumber: 1,
          originalFilename: "attestation.pdf",
          sanitizedFilename: "attestation.pdf",
          mimeType: "application/pdf",
          extension: "pdf",
          sizeBytes: 1024,
          checksum: "0".repeat(64),
          storageKey: `checklist-http-test/${documentId}/1`,
          uploadedByUserId: userId,
        },
      });
      await prisma.document.update({ where: { id: documentId }, data: { currentVersionId: versionId } });
      return { documentId, versionId };
    }

    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ title: "Piece a rapprocher" }) });
    const item = (await createRes.json()) as { id: string };

    const documentA = await createDocumentWithVersion(orgAId, ownerAUserId);
    const documentB = await createDocumentWithVersion(orgAId, ownerAUserId);
    const documentC = await createDocumentWithVersion(orgBId, ownerBUserId);

    const nonExistentRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/${item.id}/attach-document`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentId: documentA.documentId, documentVersionId: randomUUID(), matchStatus: "MANUALLY_ATTACHED" }),
    });
    expect(nonExistentRes.status).toBe(404);
    expect(((await nonExistentRes.json()) as { error: { code: string } }).error.code).toBe("DOCUMENT_VERSION_NOT_FOUND");

    const wrongDocumentRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/${item.id}/attach-document`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      // `documentA.documentId` est réel, mais `documentB.versionId` appartient à un AUTRE document.
      body: JSON.stringify({ documentId: documentA.documentId, documentVersionId: documentB.versionId, matchStatus: "MANUALLY_ATTACHED" }),
    });
    expect(wrongDocumentRes.status).toBe(404);
    expect(((await wrongDocumentRes.json()) as { error: { code: string } }).error.code).toBe("DOCUMENT_VERSION_NOT_FOUND");

    const crossTenantRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/${item.id}/attach-document`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      // `documentA.documentId` appartient bien à orgA, mais `documentC.versionId` a été créée sous orgB.
      body: JSON.stringify({ documentId: documentA.documentId, documentVersionId: documentC.versionId, matchStatus: "MANUALLY_ATTACHED" }),
    });
    expect(crossTenantRes.status).toBe(404);
    expect(((await crossTenantRes.json()) as { error: { code: string } }).error.code).toBe("DOCUMENT_VERSION_NOT_FOUND");

    // Aucune des trois tentatives n'a muté le ChecklistItem.
    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const items = (await listRes.json()) as { id: string; matchedDocumentId?: string; documentStatus: string }[];
    const persisted = items.find((candidate) => candidate.id === item.id);
    expect(persisted?.matchedDocumentId).toBeUndefined();
    expect(persisted?.documentStatus).toBe("MISSING");

    // Une version réellement rattachée au bon document réussit — preuve que le garde-fou cible
    // bien uniquement les cas invalides, jamais un faux positif sur une version légitime.
    const validRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/${item.id}/attach-document`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentId: documentA.documentId, documentVersionId: documentA.versionId, matchStatus: "MANUALLY_ATTACHED" }),
    });
    expect(validRes.status).toBe(200);
    expect(((await validRes.json()) as { matchedDocumentId: string }).matchedDocumentId).toBe(documentA.documentId);
  });

  it("cross-tenant: organization B cannot validate, attach a document to, or find matches for organization A's checklist item (404, never leaking existence)", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ title: "Piece confidentielle" }) });
    const item = (await createRes.json()) as { id: string };

    const validateRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/${item.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerB, orgBId) });
    expect(validateRes.status).toBe(404);

    const attachRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/${item.id}/attach-document`, {
      method: "POST",
      headers: authHeaders(tokenOwnerB, orgBId),
      body: JSON.stringify({ documentId: randomUUID() }),
    });
    expect(attachRes.status).toBe(404);

    const matchesRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/${item.id}/document-matches`, { method: "POST", headers: authHeaders(tokenOwnerB, orgBId) });
    expect(matchesRes.status).toBe(404);

    const reconcileRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/reconcile`, { method: "POST", headers: authHeaders(tokenOwnerB, orgBId) });
    expect(reconcileRes.status).toBe(404);
  });

  it("reconcile: a new DCE analysis with a requirement never seen before is flagged as NEW_REQUIREMENT, never silently created", async () => {
    const { tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await seedSucceededAnalysis({
      organizationId: orgAId,
      tenderId,
      actorId: ownerAUserId,
      output: minimalConsolidationOutput({ requirements: [{ category: "CERTIFICATION", label: "Certification ISO 14001", isMandatory: true, isInferred: false, confidence: 0.8 }] }),
    });

    const reconcileRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/reconcile`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(reconcileRes.status).toBe(200);
    const result = (await reconcileRes.json()) as { newRequirementSuggestionsCreated: number; possibleRemovals: unknown[] };
    expect(result.newRequirementSuggestionsCreated).toBe(1);
    expect(result.possibleRemovals).toHaveLength(0);

    // Aucune ChecklistItem créée directement — uniquement une AiSuggestion, validation humaine requise.
    const itemsRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect((await itemsRes.json()) as unknown[]).toHaveLength(0);

    const suggestionsRes = await fetch(`${baseUrl}/api/v1/ai-suggestions?entityType=CHECKLIST_ITEM&parentTenderId=${tenderId}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const suggestions = (await suggestionsRes.json()) as { proposedValue: { changeKind?: string } }[];
    expect(suggestions.some((suggestion) => suggestion.proposedValue.changeKind === "NEW_REQUIREMENT")).toBe(true);
  });
});
