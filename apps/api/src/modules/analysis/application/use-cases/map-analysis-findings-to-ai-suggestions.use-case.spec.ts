import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateAiSuggestionUseCase, ListAiSuggestionsUseCase } from "../../../ai-suggestion";
import type { GetTenderUseCase } from "../../../tenders";
import { AnalysisJob } from "../../domain/analysis-job.aggregate";
import { AnalysisScope } from "../../domain/analysis-scope";
import { InMemoryAnalysisAttemptRepository, InMemoryAnalysisJobRepository, InMemoryBusinessAnalysisRepository } from "../../test-support/fakes";
import type { TenderConsolidationOutput } from "../schemas/business/tender-consolidation-output.schema";
import { MapAnalysisFindingsToAiSuggestionsUseCase } from "./map-analysis-findings-to-ai-suggestions.use-case";

const ORG = randomUUID();
const TENDER = randomUUID();
const NOW = new Date("2026-08-01T00:00:00Z");

function minimalConsolidationOutput(overrides: Partial<TenderConsolidationOutput> = {}): TenderConsolidationOutput {
  return {
    metadata: {},
    deadlines: [{ kind: "SUBMISSION", label: "Remise des offres", date: "2026-09-01T12:00:00.000Z", isInferred: false, confidence: 0.9 }],
    criteria: [{ name: "Prix", weight: 40, isEliminatory: false, isInferred: false, confidence: 0.9 }],
    requirements: [{ category: "ADMINISTRATIVE", label: "Attestation d'assurance", isMandatory: true, isInferred: false, confidence: 0.8 }],
    clauses: [],
    risks: [
      {
        title: "Délai court",
        category: "PLANNING",
        severity: "HIGH",
        explanation: "Le délai est court.",
        recommendation: "Anticiper.",
        isInferred: true,
        confidence: 0.6,
      },
    ],
    questions: [],
    summary: {
      opportunitySummary: "Synthèse.",
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

describe("MapAnalysisFindingsToAiSuggestionsUseCase", () => {
  let jobRepository: InMemoryAnalysisJobRepository;
  let businessAnalysisRepository: InMemoryBusinessAnalysisRepository;
  let getTenderUseCase: { execute: ReturnType<typeof vi.fn> };
  let createAiSuggestionUseCase: { execute: ReturnType<typeof vi.fn> };
  let listAiSuggestionsUseCase: { execute: ReturnType<typeof vi.fn> };
  let job: AnalysisJob;

  beforeEach(async () => {
    jobRepository = new InMemoryAnalysisJobRepository(new InMemoryAnalysisAttemptRepository());
    businessAnalysisRepository = new InMemoryBusinessAnalysisRepository();
    getTenderUseCase = { execute: vi.fn(async () => ({ id: TENDER, organizationId: ORG })) };
    createAiSuggestionUseCase = { execute: vi.fn(async () => ({})) };
    listAiSuggestionsUseCase = { execute: vi.fn(async () => []) };

    job = AnalysisJob.create({
      id: randomUUID(),
      organizationId: ORG,
      tenderId: TENDER,
      scope: AnalysisScope.Tender,
      analysisVersion: 1,
      promptVersion: 1,
      triggeredByRole: "OWNER",
      occurredAt: NOW,
    });
    job.queue(NOW);
    job.reserve(NOW);
    job.complete({ outcome: "SUCCEEDED", provider: "openai", model: "gpt-test", durationMs: 10 }, NOW);
    await jobRepository.save(job);

    await businessAnalysisRepository.persistTenderConsolidation({} as never, {
      organizationId: ORG,
      analysisJobId: job.id,
      analysisVersion: 1,
      tenderId: TENDER,
      output: minimalConsolidationOutput(),
      documentVersionsByDocumentId: {},
    });
  });

  function buildUseCase(): MapAnalysisFindingsToAiSuggestionsUseCase {
    return new MapAnalysisFindingsToAiSuggestionsUseCase(
      getTenderUseCase as unknown as GetTenderUseCase,
      jobRepository,
      businessAnalysisRepository,
      createAiSuggestionUseCase as unknown as CreateAiSuggestionUseCase,
      listAiSuggestionsUseCase as unknown as ListAiSuggestionsUseCase,
    );
  }

  it("creates one AiSuggestion per mappable finding, carrying job provenance", async () => {
    const useCase = buildUseCase();
    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "u", actorRole: "BID_MANAGER" });

    expect(result).toMatchObject({ analysisVersion: 1, alreadyMapped: false, createdCount: 4, skippedCount: 0 });
    expect(createAiSuggestionUseCase.execute).toHaveBeenCalledTimes(4);
    for (const call of createAiSuggestionUseCase.execute.mock.calls) {
      expect(call[0]).toMatchObject({ organizationId: ORG, parentTenderId: TENDER, sourceAnalysisAttemptId: job.id, aiProvider: "openai", aiModel: "gpt-test" });
    }
  });

  /** V2 Sprint 6 §9-10 — redirection : la suggestion issue du RequirementFinding cible désormais
   *  CHECKLIST_ITEM, jamais TENDER_REQUESTED_DOCUMENT. */
  it("maps the RequirementFinding to a CHECKLIST_ITEM suggestion, never TENDER_REQUESTED_DOCUMENT", async () => {
    const useCase = buildUseCase();
    await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "u", actorRole: "BID_MANAGER" });

    const entityTypes = createAiSuggestionUseCase.execute.mock.calls.map((call: unknown[]) => (call[0] as { entityType: string }).entityType);
    expect(entityTypes).toContain("CHECKLIST_ITEM");
    expect(entityTypes).not.toContain("TENDER_REQUESTED_DOCUMENT");
  });

  /** V2 Sprint 6 §9 — un Criterion éliminatoire ET un Deadline VISIT produisent chacun DEUX
   *  suggestions (leur suggestion Sprint 4 existante + une CHECKLIST_ITEM additive). Le
   *  RequirementFinding par défaut (toujours présent dans `minimalConsolidationOutput`) produit
   *  lui aussi une CHECKLIST_ITEM (redirection §9-10) : 3 suggestions CHECKLIST_ITEM au total.
   *  `createdCount` doit refléter les 6 suggestions réellement créées, `skippedCount` doit rester
   *  0 (chaque finding a bien produit au moins une suggestion). */
  it("counts additive multi-suggestion findings correctly: an eliminatory criterion and a VISIT deadline each yield 2 suggestions", async () => {
    await businessAnalysisRepository.persistTenderConsolidation({} as never, {
      organizationId: ORG,
      analysisJobId: job.id,
      analysisVersion: 3,
      tenderId: TENDER,
      output: minimalConsolidationOutput({
        deadlines: [{ kind: "VISIT", label: "Visite obligatoire", date: "2026-09-01T12:00:00.000Z", isInferred: false, confidence: 0.9 }],
        criteria: [{ name: "Valeur technique", weight: 60, isEliminatory: true, threshold: "10/20", isInferred: false, confidence: 0.9 }],
      }),
      documentVersionsByDocumentId: {},
    });

    const useCase = buildUseCase();
    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "u", actorRole: "BID_MANAGER", analysisVersion: 3 });

    expect(result).toMatchObject({ analysisVersion: 3, createdCount: 6, skippedCount: 0 });
    expect(createAiSuggestionUseCase.execute).toHaveBeenCalledTimes(6);
    const checklistItemCalls = createAiSuggestionUseCase.execute.mock.calls.filter((call: unknown[]) => (call[0] as { entityType: string }).entityType === "CHECKLIST_ITEM");
    expect(checklistItemCalls).toHaveLength(3);
  });

  it("is idempotent: a second call for the same analysis job creates nothing new", async () => {
    listAiSuggestionsUseCase.execute = vi.fn(async () => [{ sourceAnalysisAttemptId: job.id }]);
    const useCase = buildUseCase();

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "u", actorRole: "BID_MANAGER" });

    expect(result).toEqual({ analysisVersion: 1, alreadyMapped: true, createdCount: 0, skippedCount: 0 });
    expect(createAiSuggestionUseCase.execute).not.toHaveBeenCalled();
  });

  it("returns an empty, non-erroring result when no consolidation has ever succeeded for this tender", async () => {
    const emptyBusinessAnalysisRepository = new InMemoryBusinessAnalysisRepository();
    const useCase = new MapAnalysisFindingsToAiSuggestionsUseCase(
      getTenderUseCase as unknown as GetTenderUseCase,
      jobRepository,
      emptyBusinessAnalysisRepository,
      createAiSuggestionUseCase as unknown as CreateAiSuggestionUseCase,
      listAiSuggestionsUseCase as unknown as ListAiSuggestionsUseCase,
    );

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "u", actorRole: "BID_MANAGER" });

    expect(result).toEqual({ analysisVersion: undefined, alreadyMapped: false, createdCount: 0, skippedCount: 0 });
    expect(createAiSuggestionUseCase.execute).not.toHaveBeenCalled();
  });

  it("refuses a VIEWER-tier role (READ_ONLY) — mapping is a write-adjacent action", async () => {
    const useCase = buildUseCase();
    await expect(useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "u", actorRole: "READ_ONLY" })).rejects.toMatchObject({
      code: "ANALYSIS_PERMISSION_MISSING",
    });
  });

  // Audit Codex P1-004 (round 3) — provenance documentaire EXACTE : capturée directement sur la
  // Finding au moment de `persistTenderConsolidation` (jamais résolue par un second appel I/O au
  // moment du mapping, ce qui serait vulnérable à un remplacement du document entre-temps).
  describe("document version provenance (audit Codex P1-004, round 3)", () => {
    const DOCUMENT_ID = randomUUID();
    const DOCUMENT_VERSION_ID = randomUUID();
    const STALE_DOCUMENT_VERSION_ID = randomUUID();

    it("carries the documentVersionId captured at consolidation-persist time onto the created suggestion", async () => {
      await businessAnalysisRepository.persistTenderConsolidation({} as never, {
        organizationId: ORG,
        analysisJobId: job.id,
        analysisVersion: 2,
        tenderId: TENDER,
        output: minimalConsolidationOutput({
          risks: [
            {
              title: "Délai court",
              category: "PLANNING",
              severity: "HIGH",
              explanation: "Le délai est court.",
              recommendation: "Anticiper.",
              documentId: DOCUMENT_ID,
              isInferred: true,
              confidence: 0.6,
            },
          ],
        }),
        documentVersionsByDocumentId: { [DOCUMENT_ID]: DOCUMENT_VERSION_ID },
      });

      const useCase = buildUseCase();
      await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "u", actorRole: "BID_MANAGER", analysisVersion: 2 });

      const riskCall = createAiSuggestionUseCase.execute.mock.calls.find((call: unknown[]) => (call[0] as { entityType: string }).entityType === "TENDER_RISK");
      expect(riskCall?.[0]).toMatchObject({ sourceDocumentId: DOCUMENT_ID, sourceDocumentVersionId: DOCUMENT_VERSION_ID });
    });

    it("never re-resolves a later/current document version — immune to a document replacement happening after this consolidation", async () => {
      // Le document a depuis reçu une nouvelle version (ex. un second import) : le snapshot capté
      // AU MOMENT de cette consolidation doit rester figé, jamais réévalué au moment du mapping.
      await businessAnalysisRepository.persistTenderConsolidation({} as never, {
        organizationId: ORG,
        analysisJobId: job.id,
        analysisVersion: 2,
        tenderId: TENDER,
        output: minimalConsolidationOutput({
          risks: [
            {
              title: "Délai court",
              category: "PLANNING",
              severity: "HIGH",
              explanation: "Le délai est court.",
              recommendation: "Anticiper.",
              documentId: DOCUMENT_ID,
              isInferred: true,
              confidence: 0.6,
            },
          ],
        }),
        documentVersionsByDocumentId: { [DOCUMENT_ID]: STALE_DOCUMENT_VERSION_ID },
      });

      const useCase = buildUseCase();
      await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "u", actorRole: "BID_MANAGER", analysisVersion: 2 });

      const riskCall = createAiSuggestionUseCase.execute.mock.calls.find((call: unknown[]) => (call[0] as { entityType: string }).entityType === "TENDER_RISK");
      expect(riskCall?.[0]).toMatchObject({ sourceDocumentVersionId: STALE_DOCUMENT_VERSION_ID });
    });

    it("leaves sourceDocumentVersionId undefined when no snapshot was available for that document (degraded provenance only, never a blocker)", async () => {
      await businessAnalysisRepository.persistTenderConsolidation({} as never, {
        organizationId: ORG,
        analysisJobId: job.id,
        analysisVersion: 2,
        tenderId: TENDER,
        output: minimalConsolidationOutput({
          risks: [
            {
              title: "Délai court",
              category: "PLANNING",
              severity: "HIGH",
              explanation: "Le délai est court.",
              recommendation: "Anticiper.",
              documentId: DOCUMENT_ID,
              isInferred: true,
              confidence: 0.6,
            },
          ],
        }),
        documentVersionsByDocumentId: {},
      });

      const useCase = buildUseCase();
      const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "u", actorRole: "BID_MANAGER", analysisVersion: 2 });

      expect(result.createdCount).toBeGreaterThan(0);
      const riskCall = createAiSuggestionUseCase.execute.mock.calls.find((call: unknown[]) => (call[0] as { entityType: string }).entityType === "TENDER_RISK");
      expect(riskCall?.[0]).toMatchObject({ sourceDocumentId: DOCUMENT_ID });
      expect((riskCall?.[0] as { sourceDocumentVersionId?: string }).sourceDocumentVersionId).toBeUndefined();
    });
  });
});
