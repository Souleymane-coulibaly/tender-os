import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { DocumentDomain } from "../../documents/domain/document-domain";
import { DocumentId } from "../../documents/domain/document-id.value-object";
import { DocumentOrigin } from "../../documents/domain/document-origin";
import { DocumentVersion } from "../../documents/domain/document-version.entity";
import { Document } from "../../documents/domain/document.aggregate";
import { PrismaDocumentRepository } from "../../documents/infrastructure/prisma-document.repository";
import { AnalysisJob } from "../domain/analysis-job.aggregate";
import { AnalysisScope } from "../domain/analysis-scope";
import type {
  DocumentAnalysisOutput,
} from "../application/schemas/business/document-analysis-output.schema";
import type { TenderConsolidationOutput } from "../application/schemas/business/tender-consolidation-output.schema";
import { PrismaAnalysisJobRepository } from "./prisma-analysis-job.repository";
import { PrismaBusinessAnalysisRepository } from "./prisma-business-analysis.repository";

/**
 * Preuve réelle contre PostgreSQL (même motif que
 * `prisma-analysis-job.repository.integration.spec.ts`) — vérifie la persistance relationnelle des
 * 8 tables métier Sprint 4.2, la résolution "dernière version consultable", la pagination,
 * l'isolation multi-tenant, et les contraintes CHECK ajoutées à la migration (confidence 0-1,
 * énumérations de catégorie/sévérité/priorité/recommandation).
 */
describe("PrismaBusinessAnalysisRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const jobRepository = new PrismaAnalysisJobRepository(prisma);
  const documentRepository = new PrismaDocumentRepository(prisma);
  const repository = new PrismaBusinessAnalysisRepository(prisma);

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const actorId = randomUUID();
  let tenderId: string;
  let dceId: string;
  let documentId: string;
  const createdTenderIds: string[] = [];
  const createdDocumentIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "BusinessAnalysis Repository Integration Test Org",
        slug: `business-analysis-repo-integration-test-org-${organizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
    await prisma.organization.create({
      data: {
        id: otherOrganizationId,
        name: "BusinessAnalysis Repository Integration Test Org (other)",
        slug: `business-analysis-repo-integration-test-org-other-${otherOrganizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });

    const clientAccount = await prisma.clientAccount.create({
      data: {
        id: randomUUID(),
        organizationId,
        name: "Client de test",
        nameNormalized: "client de test",
        status: "ACTIVE",
        createdBy: actorId,
      },
    });

    tenderId = randomUUID();
    createdTenderIds.push(tenderId);
    await prisma.tender.create({
      data: { id: tenderId, organizationId, clientAccountId: clientAccount.id, title: "Marché pour tests BusinessAnalysis", status: "DRAFT", tags: [], createdBy: actorId },
    });

    dceId = randomUUID();
    await prisma.dce.create({ data: { id: dceId, organizationId, tenderId, status: "IMPORTED", createdByUserId: actorId } });

    documentId = await createDocument();
  });

  afterAll(async () => {
    await prisma.tenderAnalysisSummary.deleteMany({ where: { organizationId } });
    await prisma.tenderQuestionFinding.deleteMany({ where: { organizationId } });
    await prisma.tenderRiskFinding.deleteMany({ where: { organizationId } });
    await prisma.tenderClauseFinding.deleteMany({ where: { organizationId } });
    await prisma.tenderRequirementFinding.deleteMany({ where: { organizationId } });
    await prisma.tenderCriterionFinding.deleteMany({ where: { organizationId } });
    await prisma.tenderDeadlineFinding.deleteMany({ where: { organizationId } });
    await prisma.documentBusinessAnalysis.deleteMany({ where: { organizationId } });
    await prisma.analysisJob.deleteMany({ where: { organizationId } });
    if (createdDocumentIds.length > 0) {
      await prisma.documentVersion.deleteMany({ where: { documentId: { in: createdDocumentIds } } });
      await prisma.document.deleteMany({ where: { id: { in: createdDocumentIds } } });
    }
    await prisma.dce.deleteMany({ where: { organizationId } });
    if (createdTenderIds.length > 0) {
      await prisma.tender.deleteMany({ where: { id: { in: createdTenderIds } } });
    }
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  });

  async function createDocument(): Promise<string> {
    const id = randomUUID();
    createdDocumentIds.push(id);
    const document = Document.create({
      id: DocumentId.from(id),
      organizationId,
      title: "cctp.pdf",
      origin: DocumentOrigin.Dce,
      domain: DocumentDomain.Tender,
      createdByUserId: actorId,
      occurredAt: new Date(),
    });
    const version = DocumentVersion.create({
      id: randomUUID(),
      organizationId,
      documentId: document.id.value,
      versionNumber: 1,
      originalFilename: "cctp.pdf",
      sanitizedFilename: "cctp.pdf",
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: 42,
      checksum: `checksum-${id}`,
      storageKey: `${organizationId}/${document.id.value}/v1.pdf`,
      uploadedByUserId: actorId,
      occurredAt: new Date(),
    });
    document.promoteVersion({ versionId: version.id, versionNumber: 1, occurredAt: new Date() });
    await documentRepository.createWithInitialVersion({ document, version });
    return document.id.value;
  }

  /** Crée un `AnalysisJob` persisté (peu importe son statut, seule son existence compte pour la
   *  FK `analysis_job_id`) — un job DOCUMENT par défaut, distinct à chaque appel. */
  async function createDocumentAnalysisJob(analysisVersion: number): Promise<string> {
    const job = AnalysisJob.create({
      id: randomUUID(),
      organizationId,
      tenderId,
      dceId,
      documentId,
      scope: AnalysisScope.Document,
      analysisVersion,
      promptVersion: 1,
      triggeredByRole: "OWNER",
      occurredAt: new Date(),
    });
    job.queue(new Date());
    await jobRepository.runExclusiveForTarget({
      organizationId,
      scope: AnalysisScope.Document,
      targetId: documentId,
      fn: async (context) => context.create(job),
    });
    return job.id;
  }

  async function createTenderAnalysisJob(analysisVersion: number): Promise<string> {
    const job = AnalysisJob.create({
      id: randomUUID(),
      organizationId,
      tenderId,
      scope: AnalysisScope.Tender,
      analysisVersion,
      promptVersion: 1,
      triggeredByRole: "OWNER",
      occurredAt: new Date(),
    });
    job.queue(new Date());
    await jobRepository.runExclusiveForTarget({
      organizationId,
      scope: AnalysisScope.Tender,
      targetId: tenderId,
      fn: async (context) => context.create(job),
    });
    return job.id;
  }

  function documentOutput(overrides: Partial<DocumentAnalysisOutput> = {}): DocumentAnalysisOutput {
    return {
      documentType: "CCTP",
      language: "fr",
      metadata: { title: "Marché de nettoyage" },
      deadlines: [{ kind: "SUBMISSION", label: "Remise des offres", date: "2026-09-01T12:00:00.000Z", isInferred: false, confidence: 0.9 }],
      criteria: [{ name: "Prix", weight: 60, isEliminatory: false, isInferred: false, confidence: 0.85 }],
      requirements: [{ category: "TECHNICAL_MEMO", label: "Mémoire technique", isMandatory: true, isInferred: false, confidence: 0.8 }],
      clauses: [{ category: "PENALTY", summary: "Pénalités de retard de 1/1000e par jour", isInferred: false, confidence: 0.7 }],
      warnings: [],
      ...overrides,
    };
  }

  function tenderOutput(overrides: Partial<TenderConsolidationOutput> = {}): TenderConsolidationOutput {
    return {
      metadata: {},
      deadlines: [
        { kind: "SUBMISSION", label: "Remise des offres", date: "2026-09-01T12:00:00.000Z", documentId, isInferred: false, confidence: 0.9 },
        { kind: "QUESTIONS", label: "Date limite des questions", date: "2026-08-15T12:00:00.000Z", documentId, isInferred: false, confidence: 0.8 },
        { kind: "PUBLICATION", label: "Date de publication", date: "2026-07-01T12:00:00.000Z", documentId, isInferred: false, confidence: 0.95 },
      ],
      criteria: [{ name: "Prix", weight: 60, isEliminatory: false, documentId, isInferred: false, confidence: 0.85 }],
      requirements: [{ category: "TECHNICAL_MEMO", label: "Mémoire technique", isMandatory: true, documentId, isInferred: false, confidence: 0.8 }],
      clauses: [{ category: "PENALTY", summary: "Pénalités de retard", documentId, isInferred: false, confidence: 0.7 }],
      risks: [
        {
          title: "Délai de réponse court",
          category: "PLANNING",
          severity: "HIGH",
          explanation: "Le délai entre publication et remise est court.",
          recommendation: "Prioriser la rédaction du mémoire technique.",
          documentId,
          isInferred: false,
          confidence: 0.75,
        },
      ],
      questions: [
        {
          question: "Le DPGF doit-il être remis au format Excel natif ?",
          justification: "Le CCAP ne précise pas le format attendu.",
          priority: "MEDIUM",
          theme: "Pièces à fournir",
          documentId,
          isInferred: false,
          confidence: 0.6,
        },
      ],
      summary: {
        opportunitySummary: "Marché de nettoyage, complexité modérée.",
        complexityLevel: "MEDIUM",
        mainCriteria: ["Prix (60%)"],
        mainRisks: ["Délai court"],
        mainObligations: ["Mémoire technique obligatoire"],
        missingElements: [],
        pointsToClarify: ["Format du DPGF"],
        conflicts: [],
        goNoGoRecommendation: "GO_WITH_RESERVATIONS",
        goNoGoRationale: "Cohérent avec le profil malgré un délai court.",
      },
      ...overrides,
    };
  }

  describe("persistDocumentAnalysis / findLatestDocumentAnalyses", () => {
    it("persists a document analysis and resolves it as the latest for its document", async () => {
      const jobId = await createDocumentAnalysisJob(1);
      await prisma.$transaction((tx) =>
        repository.persistDocumentAnalysis(tx, {
          organizationId,
          analysisJobId: jobId,
          analysisVersion: 1,
          tenderId,
          dceId,
          documentId,
          extractionVersion: 1,
          output: documentOutput(),
        }),
      );

      const latest = await repository.findLatestDocumentAnalyses({ organizationId, tenderId });
      expect(latest).toHaveLength(1);
      expect(latest[0]!.documentId).toBe(documentId);
      expect(latest[0]!.analysisVersion).toBe(1);
      expect(latest[0]!.documentType).toBe("CCTP");
      expect(latest[0]!.deadlines).toHaveLength(1);
    });

    it("resolves the HIGHEST analysisVersion once a second analysis exists for the same document", async () => {
      const jobId = await createDocumentAnalysisJob(2);
      await prisma.$transaction((tx) =>
        repository.persistDocumentAnalysis(tx, {
          organizationId,
          analysisJobId: jobId,
          analysisVersion: 2,
          tenderId,
          dceId,
          documentId,
          extractionVersion: 2,
          output: documentOutput({ documentType: "CCAP" }),
        }),
      );

      const latest = await repository.findLatestDocumentAnalyses({ organizationId, tenderId });
      expect(latest).toHaveLength(1); // toujours une seule ligne PAR DOCUMENT
      expect(latest[0]!.analysisVersion).toBe(2);
      expect(latest[0]!.documentType).toBe("CCAP");
    });

    it("never returns a document analysis belonging to another organization", async () => {
      const result = await repository.findLatestDocumentAnalyses({ organizationId: otherOrganizationId, tenderId });
      expect(result).toEqual([]);
    });
  });

  describe("persistTenderConsolidation / list*/getSummary/getLatestSummary", () => {
    it("persists all 6 finding categories and the summary atomically for one analysisVersion", async () => {
      const jobId = await createTenderAnalysisJob(1);
      await prisma.$transaction((tx) => repository.persistTenderConsolidation(tx, { organizationId, analysisJobId: jobId, analysisVersion: 1, tenderId, output: tenderOutput() }));

      const deadlines = await repository.listDeadlines({ organizationId, tenderId, analysisVersion: 1, limit: 100, offset: 0 });
      expect(deadlines.total).toBe(3);
      const criteria = await repository.listCriteria({ organizationId, tenderId, analysisVersion: 1, limit: 100, offset: 0 });
      expect(criteria.total).toBe(1);
      const requirements = await repository.listRequirements({ organizationId, tenderId, analysisVersion: 1, limit: 100, offset: 0 });
      expect(requirements.total).toBe(1);
      const clauses = await repository.listClauses({ organizationId, tenderId, analysisVersion: 1, limit: 100, offset: 0 });
      expect(clauses.total).toBe(1);
      const risks = await repository.listRisks({ organizationId, tenderId, analysisVersion: 1, limit: 100, offset: 0 });
      expect(risks.total).toBe(1);
      expect(risks.items[0]!.severity).toBe("HIGH");
      const questions = await repository.listQuestions({ organizationId, tenderId, analysisVersion: 1, limit: 100, offset: 0 });
      expect(questions.total).toBe(1);

      const summary = await repository.getSummary({ organizationId, tenderId, analysisVersion: 1 });
      expect(summary?.goNoGoRecommendation).toBe("GO_WITH_RESERVATIONS");
    });

    it("paginates a finding list with limit/offset", async () => {
      const page1 = await repository.listDeadlines({ organizationId, tenderId, analysisVersion: 1, limit: 2, offset: 0 });
      expect(page1.items).toHaveLength(2);
      expect(page1.total).toBe(3);

      const page2 = await repository.listDeadlines({ organizationId, tenderId, analysisVersion: 1, limit: 2, offset: 2 });
      expect(page2.items).toHaveLength(1);
      expect(page2.total).toBe(3);
    });

    it("getLatestSummary resolves the highest analysisVersion once a second consolidation exists", async () => {
      const jobId = await createTenderAnalysisJob(2);
      await prisma.$transaction((tx) =>
        repository.persistTenderConsolidation(tx, {
          organizationId,
          analysisJobId: jobId,
          analysisVersion: 2,
          tenderId,
          output: tenderOutput({
            summary: {
              ...tenderOutput().summary,
              goNoGoRecommendation: "GO",
              goNoGoRationale: "Version 2 : conditions clarifiées.",
            },
          }),
        }),
      );

      const latest = await repository.getLatestSummary({ organizationId, tenderId });
      expect(latest?.analysisVersion).toBe(2);
      expect(latest?.goNoGoRecommendation).toBe("GO");

      // La version 1 reste consultable explicitement — jamais écrasée (historisation complète).
      const v1 = await repository.getSummary({ organizationId, tenderId, analysisVersion: 1 });
      expect(v1?.goNoGoRecommendation).toBe("GO_WITH_RESERVATIONS");
    });

    it("returns null/empty for another organization — never leaks findings across tenants", async () => {
      const summary = await repository.getLatestSummary({ organizationId: otherOrganizationId, tenderId });
      expect(summary).toBeNull();
      const risks = await repository.listRisks({ organizationId: otherOrganizationId, tenderId, analysisVersion: 1, limit: 10, offset: 0 });
      expect(risks.total).toBe(0);
    });
  });

  describe("database invariants (CHECK constraints)", () => {
    it("rejects a confidence value outside [0, 1] on tender_risk_findings", async () => {
      await expect(
        prisma.tenderRiskFinding.create({
          data: {
            id: randomUUID(),
            organizationId,
            tenderId,
            analysisJobId: await createTenderAnalysisJob(3),
            analysisVersion: 3,
            title: "x",
            category: "OTHER",
            severity: "HIGH",
            explanation: "x",
            recommendation: "x",
            confidence: 1.5,
          },
        }),
      ).rejects.toThrow();
    });

    it("rejects an unknown severity value on tender_risk_findings", async () => {
      await expect(
        prisma.tenderRiskFinding.create({
          data: {
            id: randomUUID(),
            organizationId,
            tenderId,
            analysisJobId: await createTenderAnalysisJob(4),
            analysisVersion: 4,
            title: "x",
            category: "OTHER",
            severity: "EXTREME",
            explanation: "x",
            recommendation: "x",
            confidence: 0.5,
          },
        }),
      ).rejects.toThrow();
    });

    it("rejects an unknown goNoGoRecommendation value on tender_analysis_summaries", async () => {
      await expect(
        prisma.tenderAnalysisSummary.create({
          data: {
            id: randomUUID(),
            organizationId,
            tenderId,
            analysisJobId: await createTenderAnalysisJob(5),
            analysisVersion: 5,
            opportunitySummary: "x",
            complexityLevel: "LOW",
            goNoGoRecommendation: "DEFINITELY_YES",
            goNoGoRationale: "x",
          },
        }),
      ).rejects.toThrow();
    });

    it("rejects a weight outside [0, 100] on tender_criterion_findings", async () => {
      await expect(
        prisma.tenderCriterionFinding.create({
          data: {
            id: randomUUID(),
            organizationId,
            tenderId,
            analysisJobId: await createTenderAnalysisJob(6),
            analysisVersion: 6,
            name: "Prix",
            weight: 150,
            confidence: 0.5,
          },
        }),
      ).rejects.toThrow();
    });
  });
});
