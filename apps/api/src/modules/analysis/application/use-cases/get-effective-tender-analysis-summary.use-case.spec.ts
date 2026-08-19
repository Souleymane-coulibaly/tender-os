import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DceRepository } from "../../../dce";
import { InMemoryBusinessAnalysisRepository, InMemoryTenderAnalysisSummaryRevisionRepository } from "../../test-support/fakes";
import type { PersistTenderConsolidationInput } from "../ports/business-analysis.repository";
import { GetTenderBusinessAnalysisUseCase } from "./get-tender-business-analysis.use-case";
import { AnalysisFreshness, computeAnalysisFreshness, GetEffectiveTenderAnalysisSummaryUseCase } from "./get-effective-tender-analysis-summary.use-case";

const ORG = randomUUID();
const TENDER = randomUUID();

const FAKE_GET_TENDER_USE_CASE = { execute: async () => ({}) } as never;

function fakeDceRepository(revision: number | undefined): DceRepository {
  return { findByTenderId: async () => (revision === undefined ? null : ({ revision } as never)) } as unknown as DceRepository;
}

function baseConsolidationInput(overrides: Partial<PersistTenderConsolidationInput> = {}): PersistTenderConsolidationInput {
  return {
    organizationId: ORG,
    analysisJobId: randomUUID(),
    analysisVersion: 1,
    tenderId: TENDER,
    documentVersionsByDocumentId: {},
    output: {
      metadata: {},
      deadlines: [],
      criteria: [],
      requirements: [],
      clauses: [],
      risks: [],
      questions: [],
      summary: {
        opportunitySummary: "Marché de nettoyage.",
        complexityLevel: "MEDIUM",
        mainCriteria: [],
        mainRisks: [],
        mainObligations: [],
        missingElements: [],
        pointsToClarify: [],
        conflicts: [],
        goNoGoRecommendation: "GO",
        goNoGoRationale: "Dossier complet.",
      },
    } as never,
    ...overrides,
  };
}

async function buildHarness(currentDceRevision: number | undefined) {
  const businessAnalysisRepository = new InMemoryBusinessAnalysisRepository();
  const revisionRepository = new InMemoryTenderAnalysisSummaryRevisionRepository();
  const getTenderBusinessAnalysisUseCase = new GetTenderBusinessAnalysisUseCase(
    FAKE_GET_TENDER_USE_CASE,
    businessAnalysisRepository,
    fakeDceRepository(currentDceRevision),
  );
  const useCase = new GetEffectiveTenderAnalysisSummaryUseCase(getTenderBusinessAnalysisUseCase, revisionRepository);
  return { businessAnalysisRepository, useCase };
}

/**
 * Checkpoint 2.1-P2.1-FIX-A — cette use case n'avait aucun test avant ce checkpoint. `mission TEST
 * 2/6` : une analyse produite sur la révision DCE courante est fraîche ; une nouvelle analyse après
 * un changement DCE devient CURRENT tandis que l'ancienne devient STALE, sans jamais être
 * supprimée (mission §14/§15 — status COMPLETED distinct de freshness).
 */
describe("GetEffectiveTenderAnalysisSummaryUseCase — DCE freshness (Checkpoint 2.1-P2.1-FIX-A)", () => {
  it("TEST 2 — an analysis produced on the current DCE revision is CURRENT", async () => {
    const { businessAnalysisRepository, useCase } = await buildHarness(1);
    await businessAnalysisRepository.persistTenderConsolidation({} as never, baseConsolidationInput({ dceRevision: 1 }));

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "OWNER" });

    expect(result.dceRevision).toBe(1);
    expect(result.analysisFreshness).toBe(AnalysisFreshness.Current);
  });

  it("TEST 6 — after the DCE changes, the SAME analysis (not re-run) becomes STALE, never deleted, status untouched", async () => {
    const { businessAnalysisRepository, useCase } = await buildHarness(2);
    await businessAnalysisRepository.persistTenderConsolidation({} as never, baseConsolidationInput({ dceRevision: 1 }));

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "OWNER" });

    expect(result.dceRevision).toBe(1);
    expect(result.analysisFreshness).toBe(AnalysisFreshness.Stale);
    // Mission §15 — jamais une transformation du statut métier : le contenu reste consultable.
    expect(result.opportunitySummary).toBe("Marché de nettoyage.");
  });

  it("TEST 6 (suite) — a NEW analysis produced after the DCE change is CURRENT, the older one remains historical/stale (append-only, never overwritten)", async () => {
    const businessAnalysisRepository = new InMemoryBusinessAnalysisRepository();
    const revisionRepository = new InMemoryTenderAnalysisSummaryRevisionRepository();
    const getTenderBusinessAnalysisUseCase = new GetTenderBusinessAnalysisUseCase(FAKE_GET_TENDER_USE_CASE, businessAnalysisRepository, fakeDceRepository(2));

    await businessAnalysisRepository.persistTenderConsolidation({} as never, baseConsolidationInput({ analysisVersion: 1, dceRevision: 1 }));
    await businessAnalysisRepository.persistTenderConsolidation({} as never, baseConsolidationInput({ analysisVersion: 2, dceRevision: 2 }));

    const useCase = new GetEffectiveTenderAnalysisSummaryUseCase(getTenderBusinessAnalysisUseCase, revisionRepository);
    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "OWNER" });

    // getLatestSummary always resolves the highest analysisVersion — the new one.
    expect(result.analysisVersion).toBe(2);
    expect(result.dceRevision).toBe(2);
    expect(result.analysisFreshness).toBe(AnalysisFreshness.Current);
  });

  it("historical rows written before this checkpoint (dceRevision undefined) resolve to UNKNOWN, never a fabricated CURRENT/STALE", async () => {
    const { businessAnalysisRepository, useCase } = await buildHarness(3);
    await businessAnalysisRepository.persistTenderConsolidation({} as never, baseConsolidationInput({ dceRevision: undefined }));

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "OWNER" });

    expect(result.dceRevision).toBeUndefined();
    expect(result.analysisFreshness).toBe(AnalysisFreshness.Unknown);
  });

  it("no Dce found for this Tender (legacy/race) resolves to UNKNOWN, never a crash", async () => {
    const { businessAnalysisRepository, useCase } = await buildHarness(undefined);
    await businessAnalysisRepository.persistTenderConsolidation({} as never, baseConsolidationInput({ dceRevision: 1 }));

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "OWNER" });

    expect(result.analysisFreshness).toBe(AnalysisFreshness.Unknown);
  });

  it("a user revision layered on top of a stale base still carries the base's dceRevision/analysisFreshness", async () => {
    const businessAnalysisRepository = new InMemoryBusinessAnalysisRepository();
    const revisionRepository = new InMemoryTenderAnalysisSummaryRevisionRepository();
    const getTenderBusinessAnalysisUseCase = new GetTenderBusinessAnalysisUseCase(FAKE_GET_TENDER_USE_CASE, businessAnalysisRepository, fakeDceRepository(5));
    const useCase = new GetEffectiveTenderAnalysisSummaryUseCase(getTenderBusinessAnalysisUseCase, revisionRepository);

    await businessAnalysisRepository.persistTenderConsolidation({} as never, baseConsolidationInput({ dceRevision: 1 }));
    const base = await getTenderBusinessAnalysisUseCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "OWNER" });
    await revisionRepository.create({
      id: randomUUID(),
      organizationId: ORG,
      tenderId: TENDER,
      baseSummaryId: base.id,
      editedByUserId: "user-1",
      editedAt: new Date("2026-01-01T00:00:00Z"),
      opportunitySummary: "Résumé corrigé par l'utilisateur.",
    } as never);

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "OWNER" });

    expect(result.hasUserRevision).toBe(true);
    expect(result.opportunitySummary).toBe("Résumé corrigé par l'utilisateur.");
    expect(result.dceRevision).toBe(1);
    expect(result.analysisFreshness).toBe(AnalysisFreshness.Stale);
  });
});

describe("computeAnalysisFreshness (pure function)", () => {
  it("TEST 1 — matching revisions are CURRENT", () => {
    expect(computeAnalysisFreshness(1, 1)).toBe(AnalysisFreshness.Current);
  });

  it("diverging revisions are STALE", () => {
    expect(computeAnalysisFreshness(1, 2)).toBe(AnalysisFreshness.Stale);
  });

  it("a missing captured revision is UNKNOWN", () => {
    expect(computeAnalysisFreshness(undefined, 1)).toBe(AnalysisFreshness.Unknown);
  });

  it("a missing current revision (no Dce) is UNKNOWN", () => {
    expect(computeAnalysisFreshness(1, undefined)).toBe(AnalysisFreshness.Unknown);
  });

  it("both missing is UNKNOWN", () => {
    expect(computeAnalysisFreshness(undefined, undefined)).toBe(AnalysisFreshness.Unknown);
  });
});
