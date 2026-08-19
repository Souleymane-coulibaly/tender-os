import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DceRepository } from "../../dce";
import type { DocumentAnalysisInput, GetDocumentAnalysisInputUseCase } from "../../extraction";
import { AnalysisJob } from "../domain/analysis-job.aggregate";
import { AnalysisScope } from "../domain/analysis-scope";
import {
  AiProvenanceValidationFailedError,
  AiSchemaValidationFailedError,
  AnalysisJobMissingTriggeredByRoleError,
  NoDocumentAnalysesAvailableError,
} from "../domain/errors";
import { InMemoryBusinessAnalysisRepository } from "../test-support/fakes";
import { BusinessAnalysisContentResolver } from "./business-analysis-content-resolver";
import type { BusinessAnalysisRepository, PersistTenderConsolidationInput } from "../application/ports/business-analysis.repository";
import { StaticPromptTemplateProvider } from "./static-prompt-template.provider";

const ORG = randomUUID();
const TENDER = randomUUID();
const DOCUMENT = randomUUID();
const DCE = randomUUID();
const DOCUMENT_VERSION = randomUUID();
const NOW = new Date("2026-07-30T10:00:00Z");
const DCE_REVISION = 4;

/** Checkpoint 2.1-P2.1-FIX-A — fake minimal, seul `findByTenderId` est consommé par le resolver
 *  (résolution de `Dce.revision` au moment de `handleSuccess`, scope TENDER uniquement). */
function fakeDceRepository(revision: number | undefined = DCE_REVISION): DceRepository {
  return { findByTenderId: async () => (revision === undefined ? null : ({ revision } as never)) } as unknown as DceRepository;
}

function fakeDocumentInput(overrides?: Partial<DocumentAnalysisInput>): DocumentAnalysisInput {
  return {
    organizationId: ORG,
    tenderId: TENDER,
    dceId: DCE,
    documentId: DOCUMENT,
    documentVersionId: DOCUMENT_VERSION,
    documentName: "cctp.pdf",
    documentType: "TECHNICAL",
    extractionId: DOCUMENT,
    extractionStatus: "SUCCEEDED",
    extractionVersion: 3,
    partial: false,
    warnings: [],
    chunks: [
      { sequence: 0, content: "Le présent CCTP décrit la prestation de nettoyage.", characterCount: 50, checksum: "chk-0", pageStart: 1, pageEnd: 1 },
    ],
    ...overrides,
  };
}

function buildDocumentJob(triggeredByRole: string | undefined): AnalysisJob {
  const job = AnalysisJob.create({
    id: randomUUID(),
    organizationId: ORG,
    tenderId: TENDER,
    dceId: DCE,
    documentId: DOCUMENT,
    scope: AnalysisScope.Document,
    analysisVersion: 1,
    promptVersion: 1,
    extractionVersion: 3,
    triggeredByRole,
    occurredAt: NOW,
  });
  job.queue(NOW);
  job.reserve(NOW);
  return job;
}

function buildTenderJob(triggeredByRole: string | undefined): AnalysisJob {
  const job = AnalysisJob.create({
    id: randomUUID(),
    organizationId: ORG,
    tenderId: TENDER,
    scope: AnalysisScope.Tender,
    analysisVersion: 1,
    promptVersion: 1,
    triggeredByRole,
    occurredAt: NOW,
  });
  job.queue(NOW);
  job.reserve(NOW);
  return job;
}

describe("BusinessAnalysisContentResolver", () => {
  let businessAnalysisRepository: InMemoryBusinessAnalysisRepository;
  let getDocumentAnalysisInputUseCase: { execute: ReturnType<typeof vi.fn> };
  let resolver: BusinessAnalysisContentResolver;

  beforeEach(() => {
    businessAnalysisRepository = new InMemoryBusinessAnalysisRepository();
    getDocumentAnalysisInputUseCase = { execute: vi.fn(async () => fakeDocumentInput()) };
    resolver = new BusinessAnalysisContentResolver(
      getDocumentAnalysisInputUseCase as unknown as GetDocumentAnalysisInputUseCase,
      businessAnalysisRepository,
      new StaticPromptTemplateProvider(),
      fakeDceRepository(),
    );
  });

  describe("prepare — DOCUMENT scope", () => {
    it("fetches the document's chunks via GetDocumentAnalysisInputUseCase using the job's triggeredByRole", async () => {
      const job = buildDocumentJob("CONTRIBUTOR");

      const prepared = await resolver.prepare(job);

      expect(getDocumentAnalysisInputUseCase.execute).toHaveBeenCalledWith({
        organizationId: ORG,
        tenderId: TENDER,
        documentId: DOCUMENT,
        actorRole: "CONTRIBUTOR",
      });
      expect(prepared.responseSchemaName).toBe("DocumentAnalysisOutputSchema");
      expect(prepared.userPrompt).toContain("[0]");
      expect(prepared.userPrompt).toContain("nettoyage");
    });

    it("refuses to prepare a job that never captured a triggeredByRole — never fabricates one", async () => {
      const job = buildDocumentJob(undefined);
      await expect(resolver.prepare(job)).rejects.toBeInstanceOf(AnalysisJobMissingTriggeredByRoleError);
      expect(getDocumentAnalysisInputUseCase.execute).not.toHaveBeenCalled();
    });
  });

  describe("prepare — TENDER scope", () => {
    it("consolidates the latest document analyses already persisted for this tender", async () => {
      await businessAnalysisRepository.persistDocumentAnalysis({} as never, {
        organizationId: ORG,
        analysisJobId: randomUUID(),
        analysisVersion: 1,
        tenderId: TENDER,
        dceId: DCE,
        documentId: DOCUMENT,
        extractionVersion: 1,
        documentVersionId: DOCUMENT_VERSION,
        output: {
          documentType: "CCTP",
          language: "fr",
          metadata: {},
          deadlines: [],
          criteria: [],
          requirements: [],
          clauses: [],
          warnings: [],
        },
      });

      const job = buildTenderJob("OWNER");
      const prepared = await resolver.prepare(job);

      expect(prepared.responseSchemaName).toBe("TenderConsolidationOutputSchema");
      expect(prepared.userPrompt).toContain(DOCUMENT);
      expect(getDocumentAnalysisInputUseCase.execute).not.toHaveBeenCalled();
    });

    it("refuses to consolidate a tender with zero successfully analyzed documents — never hallucinate from nothing", async () => {
      const job = buildTenderJob("OWNER");
      await expect(resolver.prepare(job)).rejects.toBeInstanceOf(NoDocumentAnalysesAvailableError);
    });
  });

  describe("handleSuccess — DOCUMENT scope", () => {
    it("validates the raw content and prepares a persist() that writes the document analysis", async () => {
      const job = buildDocumentJob("OWNER");
      const raw = JSON.stringify({
        documentType: "CCTP",
        language: "fr",
        metadata: { title: "Marché de nettoyage" },
        deadlines: [],
        criteria: [],
        requirements: [],
        clauses: [],
        warnings: [],
      });

      const success = await resolver.handleSuccess(job, raw);
      expect(success.resultSummary).toContain("CCTP");

      await success.persist({} as never);
      const analyses = await businessAnalysisRepository.findLatestDocumentAnalyses({ organizationId: ORG, tenderId: TENDER });
      expect(analyses).toHaveLength(1);
      expect(analyses[0]!.documentId).toBe(DOCUMENT);
      // Audit Codex P1-004 (round 3) — la version exacte fournie par Extraction est bien gravée
      // sur l'analyse documentaire, jamais recalculée après coup.
      expect(analyses[0]!.documentVersionId).toBe(DOCUMENT_VERSION);
    });

    it("throws AiSchemaValidationFailedError on a structurally invalid response — never persists it", async () => {
      const job = buildDocumentJob("OWNER");
      await expect(resolver.handleSuccess(job, "not json at all")).rejects.toBeInstanceOf(AiSchemaValidationFailedError);

      const analyses = await businessAnalysisRepository.findLatestDocumentAnalyses({ organizationId: ORG, tenderId: TENDER });
      expect(analyses).toHaveLength(0);
    });

    it("throws AiSchemaValidationFailedError when a provider response omits 'confidence' on a deadline item — never persists it, never a fabricated default", async () => {
      const job = buildDocumentJob("OWNER");
      const raw = JSON.stringify({
        documentType: "CCTP",
        language: "fr",
        metadata: {},
        deadlines: [{ kind: "SUBMISSION", label: "Date limite", date: "2026-09-01T12:00:00.000Z" }],
        criteria: [],
        requirements: [],
        clauses: [],
        warnings: [],
      });

      await expect(resolver.handleSuccess(job, raw)).rejects.toBeInstanceOf(AiSchemaValidationFailedError);
      const analyses = await businessAnalysisRepository.findLatestDocumentAnalyses({ organizationId: ORG, tenderId: TENDER });
      expect(analyses).toHaveLength(0);
    });

    it("throws AiProvenanceValidationFailedError when the citation is not found in the cited chunk — never persists it", async () => {
      const job = buildDocumentJob("OWNER");
      const raw = JSON.stringify({
        documentType: "CCTP",
        language: "fr",
        metadata: {},
        deadlines: [],
        criteria: [
          { name: "Prix", isEliminatory: false, chunkSequence: 0, citation: "texte totalement inventé", confidence: 0.8 },
        ],
        requirements: [],
        clauses: [],
        warnings: [],
      });

      await expect(resolver.handleSuccess(job, raw)).rejects.toBeInstanceOf(AiProvenanceValidationFailedError);
      const analyses = await businessAnalysisRepository.findLatestDocumentAnalyses({ organizationId: ORG, tenderId: TENDER });
      expect(analyses).toHaveLength(0);
    });

    it("throws AiProvenanceValidationFailedError when chunkSequence does not exist for this document", async () => {
      const job = buildDocumentJob("OWNER");
      const raw = JSON.stringify({
        documentType: "CCTP",
        language: "fr",
        metadata: {},
        deadlines: [],
        criteria: [{ name: "Prix", isEliminatory: false, chunkSequence: 99, confidence: 0.8 }],
        requirements: [],
        clauses: [],
        warnings: [],
      });

      await expect(resolver.handleSuccess(job, raw)).rejects.toBeInstanceOf(AiProvenanceValidationFailedError);
    });
  });

  describe("handleSuccess — TENDER scope", () => {
    /** Persiste une analyse documentaire déjà "consolidée" pour `DOCUMENT` — condition préalable
     *  à toute provenance tender-level valide désignant ce document (mission §"documentId doit
     *  appartenir aux documents consolidés du tender et de l'organisation"). */
    async function seedConsolidatedDocument(): Promise<void> {
      await businessAnalysisRepository.persistDocumentAnalysis({} as never, {
        organizationId: ORG,
        analysisJobId: randomUUID(),
        analysisVersion: 1,
        tenderId: TENDER,
        dceId: DCE,
        documentId: DOCUMENT,
        extractionVersion: 1,
        documentVersionId: DOCUMENT_VERSION,
        output: { documentType: "CCTP", language: "fr", metadata: {}, deadlines: [], criteria: [], requirements: [], clauses: [], warnings: [] },
      });
    }

    it("validates the raw content and prepares a persist() that writes the consolidated findings", async () => {
      await seedConsolidatedDocument();
      const job = buildTenderJob("OWNER");
      const raw = JSON.stringify({
        metadata: {},
        deadlines: [],
        criteria: [],
        requirements: [],
        clauses: [],
        risks: [
          {
            title: "Délai court",
            category: "PLANNING",
            severity: "HIGH",
            explanation: "Délai de réponse court.",
            recommendation: "Anticiper.",
            documentId: DOCUMENT,
            confidence: 0.8,
          },
        ],
        questions: [],
        summary: {
          opportunitySummary: "Résumé",
          complexityLevel: "LOW",
          mainCriteria: [],
          mainRisks: [],
          mainObligations: [],
          missingElements: [],
          pointsToClarify: [],
          conflicts: [],
          goNoGoRecommendation: "GO",
          goNoGoRationale: "Cohérent.",
        },
      });

      const success = await resolver.handleSuccess(job, raw);
      expect(success.resultSummary).toContain("GO");

      let capturedInput: PersistTenderConsolidationInput | undefined;
      // Object spread ne copie jamais les méthodes de prototype d'une instance de classe (seules
      // les propriétés d'instance le sont) — délègue explicitement chaque méthode au vrai
      // repository en mémoire, ne surcharge que `persistTenderConsolidation`.
      const spyRepository: BusinessAnalysisRepository = {
        persistDocumentAnalysis: businessAnalysisRepository.persistDocumentAnalysis.bind(businessAnalysisRepository),
        persistTenderConsolidation: vi.fn(async (_tx: never, input: PersistTenderConsolidationInput) => {
          capturedInput = input;
        }),
        findLatestDocumentAnalyses: businessAnalysisRepository.findLatestDocumentAnalyses.bind(businessAnalysisRepository),
        listDeadlines: businessAnalysisRepository.listDeadlines.bind(businessAnalysisRepository),
        listCriteria: businessAnalysisRepository.listCriteria.bind(businessAnalysisRepository),
        listRequirements: businessAnalysisRepository.listRequirements.bind(businessAnalysisRepository),
        listClauses: businessAnalysisRepository.listClauses.bind(businessAnalysisRepository),
        listRisks: businessAnalysisRepository.listRisks.bind(businessAnalysisRepository),
        listQuestions: businessAnalysisRepository.listQuestions.bind(businessAnalysisRepository),
        getSummary: businessAnalysisRepository.getSummary.bind(businessAnalysisRepository),
        getLatestSummary: businessAnalysisRepository.getLatestSummary.bind(businessAnalysisRepository),
      };
      const spyResolver = new BusinessAnalysisContentResolver(
        getDocumentAnalysisInputUseCase as unknown as GetDocumentAnalysisInputUseCase,
        spyRepository,
        new StaticPromptTemplateProvider(),
        fakeDceRepository(),
      );
      const successFromSpy = await spyResolver.handleSuccess(job, raw);
      await successFromSpy.persist({} as never);

      expect(capturedInput?.tenderId).toBe(TENDER);
      expect(capturedInput?.output.risks).toHaveLength(1);
      // Audit Codex P1-004 (round 3) — le resolver construit le snapshot documentId ->
      // documentVersionId à partir de `consolidatedAnalyses` (déjà chargé pour la validation de
      // provenance), jamais une seconde résolution I/O au moment du mapping.
      expect(capturedInput?.documentVersionsByDocumentId).toEqual({ [DOCUMENT]: DOCUMENT_VERSION });
      // Checkpoint 2.1-P2.1-FIX-A — la révision DCE courante est capturée sur la consolidation.
      expect(capturedInput?.dceRevision).toBe(DCE_REVISION);
    });

    it("throws AiProvenanceValidationFailedError when a finding cites a documentId never consolidated for this tender (invented source)", async () => {
      await seedConsolidatedDocument();
      const job = buildTenderJob("OWNER");
      const foreignDocumentId = randomUUID();
      const raw = JSON.stringify({
        metadata: {},
        deadlines: [],
        criteria: [{ name: "Prix", isEliminatory: false, documentId: foreignDocumentId, confidence: 0.8 }],
        requirements: [],
        clauses: [],
        risks: [],
        questions: [],
        summary: {
          opportunitySummary: "Résumé",
          complexityLevel: "LOW",
          mainCriteria: [],
          mainRisks: [],
          mainObligations: [],
          missingElements: [],
          pointsToClarify: [],
          conflicts: [],
          goNoGoRecommendation: "GO",
          goNoGoRationale: "Cohérent.",
        },
      });

      await expect(resolver.handleSuccess(job, raw)).rejects.toBeInstanceOf(AiProvenanceValidationFailedError);
      expect(getDocumentAnalysisInputUseCase.execute).not.toHaveBeenCalled(); // jamais résolu de chunks pour un document non consolidé
    });

    it("throws AiProvenanceValidationFailedError when chunkSequence does not exist for the cited document", async () => {
      await seedConsolidatedDocument();
      const job = buildTenderJob("OWNER");
      const raw = JSON.stringify({
        metadata: {},
        deadlines: [],
        criteria: [{ name: "Prix", isEliminatory: false, documentId: DOCUMENT, chunkSequence: 99, confidence: 0.8 }],
        requirements: [],
        clauses: [],
        risks: [],
        questions: [],
        summary: {
          opportunitySummary: "Résumé",
          complexityLevel: "LOW",
          mainCriteria: [],
          mainRisks: [],
          mainObligations: [],
          missingElements: [],
          pointsToClarify: [],
          conflicts: [],
          goNoGoRecommendation: "GO",
          goNoGoRationale: "Cohérent.",
        },
      });

      await expect(resolver.handleSuccess(job, raw)).rejects.toBeInstanceOf(AiProvenanceValidationFailedError);
    });

    it("throws AiProvenanceValidationFailedError when the citation does not exist in the cited chunk's content", async () => {
      await seedConsolidatedDocument();
      const job = buildTenderJob("OWNER");
      const raw = JSON.stringify({
        metadata: {},
        deadlines: [],
        criteria: [],
        requirements: [],
        clauses: [],
        risks: [
          {
            title: "Délai court",
            category: "PLANNING",
            severity: "HIGH",
            explanation: "x",
            recommendation: "x",
            documentId: DOCUMENT,
            chunkSequence: 0,
            citation: "texte totalement inventé, absent du document",
            confidence: 0.8,
          },
        ],
        questions: [],
        summary: {
          opportunitySummary: "Résumé",
          complexityLevel: "LOW",
          mainCriteria: [],
          mainRisks: [],
          mainObligations: [],
          missingElements: [],
          pointsToClarify: [],
          conflicts: [],
          goNoGoRecommendation: "GO",
          goNoGoRationale: "Cohérent.",
        },
      });

      await expect(resolver.handleSuccess(job, raw)).rejects.toBeInstanceOf(AiProvenanceValidationFailedError);
    });
  });
});
