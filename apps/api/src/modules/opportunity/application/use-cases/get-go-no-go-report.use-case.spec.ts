import { describe, expect, it, vi } from "vitest";
import type { EffectiveTenderAnalysisSummary } from "../../../analysis";
import { GetTenderUseCase } from "../../../tenders";
import { Tender } from "../../../tenders/domain/tender.aggregate";
import { TenderId } from "../../../tenders/domain/tender-id.value-object";
import { createClientPortfolioTestFixture, DEFAULT_TEST_CLIENT_ACCOUNT_ID, InMemoryTenderRepository } from "../../../tenders/test-support/fakes";
import { GoNoGoReportNotFoundError } from "../../domain/errors";
import { InMemoryGoNoGoReportRepository } from "../../test-support/fakes";
import type { CreateGoNoGoReportInput } from "../ports/go-no-go-report.repository";
import { GetGoNoGoReportUseCase } from "./get-go-no-go-report.use-case";

const ORG = "org-1";
const TENDER_ID = "tender-1";

function baseInput(overrides: Partial<CreateGoNoGoReportInput> = {}): CreateGoNoGoReportInput {
  return {
    id: "report-1",
    organizationId: ORG,
    tenderId: TENDER_ID,
    reportVersion: 1,
    analysisVersion: 1,
    dceRevision: 1,
    calculationVersion: "1.0.0",
    requestedByUserId: "user-1",
    generatedAt: new Date("2026-01-01T00:00:00Z"),
    result: {
      globalScore: 50,
      confidence: 0.5,
      complexity: 3,
      documentaryLoad: "MEDIUM",
      estimatedPrepTime: {} as never,
      categoryScores: {} as never,
      positiveCauses: [],
      negativeCauses: [],
      risks: [],
      blockers: [],
      missingInfo: [],
      subcontractingFlags: [],
      recommendation: "GO",
      recommendationRationale: "Dossier complet.",
    },
    ...overrides,
  };
}

function currentAnalysisSummary(overrides: Partial<EffectiveTenderAnalysisSummary> = {}): EffectiveTenderAnalysisSummary {
  return {
    id: "summary-1",
    analysisVersion: 1,
    dceRevision: 1,
    analysisFreshness: "CURRENT",
    opportunitySummary: "Marché de nettoyage de bureaux.",
    complexityLevel: "MEDIUM",
    mainCriteria: [],
    mainRisks: [],
    mainObligations: [],
    missingElements: [],
    pointsToClarify: [],
    conflicts: undefined,
    goNoGoRecommendation: "GO",
    goNoGoRationale: "Dossier complet.",
    createdAt: "2026-01-01T00:00:00.000Z",
    hasUserRevision: false,
    ...overrides,
  };
}

async function buildHarness(
  tenderOverrides: Partial<Parameters<typeof Tender.create>[0]> = {},
  analysisOverrides: Partial<EffectiveTenderAnalysisSummary> = {},
) {
  const tenderRepository = new InMemoryTenderRepository();
  const reportRepository = new InMemoryGoNoGoReportRepository();
  const clientPortfolio = await createClientPortfolioTestFixture(ORG);
  const getTenderUseCase = new GetTenderUseCase(tenderRepository, clientPortfolio.assertClientAccessUseCase);
  const getEffectiveTenderAnalysisSummaryUseCase = { execute: vi.fn(async () => currentAnalysisSummary(analysisOverrides)) };
  const useCase = new GetGoNoGoReportUseCase(reportRepository, getTenderUseCase, clientPortfolio.assertClientAccessUseCase, getEffectiveTenderAnalysisSummaryUseCase as never);

  const tender = Tender.create({
    id: TenderId.from(TENDER_ID),
    organizationId: ORG,
    clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
    title: "Marché de nettoyage",
    createdBy: "user-1",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    ...tenderOverrides,
  });
  await tenderRepository.seed(tender);

  return { tenderRepository, reportRepository, useCase, getEffectiveTenderAnalysisSummaryUseCase };
}

/** Checkpoint 2.1-A6.2 (correctif audit — P2 F-A6.2-01 "fraîcheur candidate") — cette use case
 *  n'avait aucun test avant ce correctif. */
describe("GetGoNoGoReportUseCase", () => {
  it("throws GoNoGoReportNotFoundError when no report exists yet", async () => {
    const { useCase } = await buildHarness();

    await expect(useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" })).rejects.toThrow(GoNoGoReportNotFoundError);
  });

  it("candidateStale=false when the report's snapshot candidate matches the Tender's current candidateCompanyId", async () => {
    const { reportRepository, useCase } = await buildHarness({ candidateCompanyId: "candidate-alpha" });
    await reportRepository.create(baseInput({ candidateCompanyId: "candidate-alpha" }));

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.candidateStale).toBe(false);
  });

  it("BLOQUANT (F-A6.2-01, test métier explicite) — candidateStale=true after the Tender's candidate changed from Alpha to Beta since this report was generated", async () => {
    const { reportRepository, useCase } = await buildHarness({ candidateCompanyId: "candidate-beta" });
    await reportRepository.create(baseInput({ candidateCompanyId: "candidate-alpha" }));

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.candidateStale).toBe(true);
  });

  it("candidateStale=true when a candidate is now resolved but the report was generated before any candidate was selected (LEGACY FLOW snapshot)", async () => {
    const { reportRepository, useCase } = await buildHarness({ candidateCompanyId: "candidate-alpha" });
    await reportRepository.create(baseInput({ candidateCompanyId: undefined }));

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.candidateStale).toBe(true);
  });

  it("candidateStale=false for a legacy Tender (never had a candidate) whose report was also generated without one", async () => {
    const { reportRepository, useCase } = await buildHarness();
    await reportRepository.create(baseInput({ candidateCompanyId: undefined }));

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.candidateStale).toBe(false);
  });

  describe("Freshness (Checkpoint 2.1-P2.1-FIX-C)", () => {
    // TEST G1
    it("freshness=CURRENT when the report's analysisVersion matches the current one and that analysis is itself CURRENT", async () => {
      const { reportRepository, useCase } = await buildHarness();
      await reportRepository.create(baseInput());

      const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

      expect(result.freshness).toBe("CURRENT");
      expect(result.dceStale).toBe(false);
      expect(result.analysisStale).toBe(false);
    });

    // TEST G2 — BLOQUANT (mission §10) : "Attendu immédiatement : G4 = STALE, même avant nouvelle
    // analyse." Le rapport référence TOUJOURS analysisVersion=1 (la seule qui existe), mais cette
    // analyse elle-même est désormais STALE vis-à-vis du DCE courant.
    it("freshness=STALE the instant the DCE changes, even before any reanalysis exists (audit mission §10)", async () => {
      const { reportRepository, useCase } = await buildHarness({}, { analysisVersion: 1, analysisFreshness: "STALE" });
      await reportRepository.create(baseInput());

      const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

      expect(result.freshness).toBe("STALE");
      expect(result.dceStale).toBe(true);
      expect(result.analysisStale).toBe(false);
    });

    // TEST G3/G4 — une analyse plus récente existe désormais (analysisVersion 2), même si CETTE
    // analyse est elle-même CURRENT : l'ancien rapport (analysisVersion 1) ne redevient JAMAIS
    // CURRENT simplement parce que ses dépendances ont été rafraîchies ailleurs.
    it("freshness=STALE (never CURRENT again) once a newer analysisVersion exists, regardless of that newer analysis's own freshness", async () => {
      const { reportRepository, useCase } = await buildHarness({}, { analysisVersion: 2, analysisFreshness: "CURRENT" });
      await reportRepository.create(baseInput({ analysisVersion: 1 }));

      const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

      expect(result.freshness).toBe("STALE");
      expect(result.analysisStale).toBe(true);
    });

    // TEST G14 — un rapport sans provenance DCE (généré avant ce checkpoint) est UNKNOWN, jamais
    // CURRENT inventé, même si son analysisVersion correspond exactement à l'actuelle.
    it("freshness=UNKNOWN for a historical report with no dceRevision provenance (audit mission §26)", async () => {
      const { reportRepository, useCase } = await buildHarness();
      await reportRepository.create(baseInput({ dceRevision: undefined }));

      const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

      expect(result.freshness).toBe("UNKNOWN");
    });

    it("freshness=STALE when the candidate has changed, even if the analysis is perfectly CURRENT and versions match", async () => {
      const { reportRepository, useCase } = await buildHarness({ candidateCompanyId: "candidate-beta" });
      await reportRepository.create(baseInput({ candidateCompanyId: "candidate-alpha" }));

      const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

      expect(result.freshness).toBe("STALE");
      expect(result.candidateStale).toBe(true);
      expect(result.dceStale).toBe(false);
      expect(result.analysisStale).toBe(false);
    });

    // TEST G21 — deux dimensions changent simultanément : ni l'une ni l'autre ne masque le signal
    // de l'autre, les deux restent lisibles indépendamment.
    it("BLOQUANT (TEST G21) — candidate AND DCE change simultaneously: both reasons are reported, neither hides the other", async () => {
      const { reportRepository, useCase } = await buildHarness({ candidateCompanyId: "candidate-beta" }, { analysisVersion: 1, dceRevision: 1, analysisFreshness: "STALE" });
      await reportRepository.create(baseInput({ candidateCompanyId: "candidate-alpha" }));

      const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER_ID, actorId: "user-1", actorRole: "BID_MANAGER" });

      expect(result.freshness).toBe("STALE");
      expect(result.candidateStale).toBe(true);
      expect(result.dceStale).toBe(true);
    });
  });
});
