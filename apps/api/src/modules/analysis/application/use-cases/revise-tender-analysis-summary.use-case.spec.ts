import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetTenderUseCase } from "../../../tenders";
import { FixedClock, InMemoryAuditLogWriter, InMemoryBusinessAnalysisRepository, InMemoryTenderAnalysisSummaryRevisionRepository } from "../../test-support/fakes";
import { ListTenderAnalysisSummaryRevisionsUseCase } from "./list-tender-analysis-summary-revisions.use-case";
import { ReviseTenderAnalysisSummaryUseCase } from "./revise-tender-analysis-summary.use-case";

const ORG = randomUUID();
const TENDER = randomUUID();
const NOW = new Date("2026-08-01T00:00:00Z");

describe("ReviseTenderAnalysisSummaryUseCase / ListTenderAnalysisSummaryRevisionsUseCase", () => {
  let businessAnalysisRepository: InMemoryBusinessAnalysisRepository;
  let revisionRepository: InMemoryTenderAnalysisSummaryRevisionRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let getTenderUseCase: { execute: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    businessAnalysisRepository = new InMemoryBusinessAnalysisRepository();
    revisionRepository = new InMemoryTenderAnalysisSummaryRevisionRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    getTenderUseCase = { execute: vi.fn(async () => ({ id: TENDER, organizationId: ORG })) };

    await businessAnalysisRepository.persistTenderConsolidation({} as never, {
      organizationId: ORG,
      analysisJobId: randomUUID(),
      analysisVersion: 1,
      tenderId: TENDER,
      output: {
        metadata: {},
        deadlines: [],
        criteria: [],
        requirements: [],
        clauses: [],
        risks: [],
        questions: [],
        summary: {
          opportunitySummary: "Synthèse originale de l'IA.",
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
      } as never,
      documentVersionsByDocumentId: {},
    });
  });

  function buildReviseUseCase(): ReviseTenderAnalysisSummaryUseCase {
    return new ReviseTenderAnalysisSummaryUseCase(
      getTenderUseCase as unknown as GetTenderUseCase,
      businessAnalysisRepository,
      revisionRepository,
      auditLogWriter,
      new FixedClock(NOW),
    );
  }

  function buildListUseCase(): ListTenderAnalysisSummaryRevisionsUseCase {
    return new ListTenderAnalysisSummaryRevisionsUseCase(getTenderUseCase as unknown as GetTenderUseCase, businessAnalysisRepository, revisionRepository);
  }

  it("creates revision #1 without ever mutating the original AI summary", async () => {
    const useCase = buildReviseUseCase();
    const revision = await useCase.execute({
      organizationId: ORG,
      tenderId: TENDER,
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      opportunitySummary: "Synthèse corrigée par l'utilisateur.",
      reason: "Le contexte budgétaire a changé.",
    });

    expect(revision.revisionNumber).toBe(1);
    expect(revision.opportunitySummary).toBe("Synthèse corrigée par l'utilisateur.");
    expect(revision.complexityLevel).toBeUndefined();

    const original = await businessAnalysisRepository.getLatestSummary({ organizationId: ORG, tenderId: TENDER });
    expect(original?.opportunitySummary).toBe("Synthèse originale de l'IA.");

    expect(auditLogWriter.entries).toHaveLength(1);
    expect(auditLogWriter.entries[0]).toMatchObject({ action: "analysis.summary_revised", resourceType: "tender_analysis_summary" });
  });

  it("attributes sequential revision numbers per base summary", async () => {
    const useCase = buildReviseUseCase();
    await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "BID_MANAGER", opportunitySummary: "Première correction." });
    const second = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "BID_MANAGER", opportunitySummary: "Seconde correction." });

    expect(second.revisionNumber).toBe(2);
  });

  it("throws TENDER_BUSINESS_ANALYSIS_NOT_FOUND when no consolidation has ever succeeded", async () => {
    const emptyRepository = new InMemoryBusinessAnalysisRepository();
    const useCase = new ReviseTenderAnalysisSummaryUseCase(getTenderUseCase as unknown as GetTenderUseCase, emptyRepository, revisionRepository, auditLogWriter, new FixedClock(NOW));

    await expect(
      useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "BID_MANAGER", opportunitySummary: "x" }),
    ).rejects.toMatchObject({ code: "TENDER_BUSINESS_ANALYSIS_NOT_FOUND" });
  });

  it("refuses a VIEWER-tier role (READ_ONLY)", async () => {
    const useCase = buildReviseUseCase();
    await expect(
      useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "READ_ONLY", opportunitySummary: "x" }),
    ).rejects.toMatchObject({ code: "ANALYSIS_PERMISSION_MISSING" });
  });

  it("lists revisions most-recent-first, and returns an empty list when none exist yet", async () => {
    const listUseCase = buildListUseCase();
    expect(await listUseCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "REVIEWER" })).toEqual([]);

    const reviseUseCase = buildReviseUseCase();
    await reviseUseCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "BID_MANAGER", opportunitySummary: "Première correction." });
    await reviseUseCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "BID_MANAGER", opportunitySummary: "Seconde correction." });

    const revisions = await listUseCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "REVIEWER" });
    expect(revisions.map((r) => r.revisionNumber)).toEqual([2, 1]);
  });
});
