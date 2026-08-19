import { beforeEach, describe, expect, it, vi } from "vitest";
import { TenderBusinessAnalysisNotFoundError } from "../../../analysis";
import { ChecklistFreshness } from "../../../tenders";
import { InMemoryChecklistReconciliationRepository } from "../../../tenders/test-support/fakes";
import { GetChecklistFreshnessUseCase } from "./get-checklist-freshness.use-case";

const ORG = "org-1";
const TENDER = "tender-1";

function fakeGetTenderUseCase() {
  return { execute: vi.fn(async () => ({ id: TENDER, organizationId: ORG })) };
}

describe("GetChecklistFreshnessUseCase (Checkpoint 2.1-P2.1-FIX-B)", () => {
  let reconciliationRepository: InMemoryChecklistReconciliationRepository;

  beforeEach(() => {
    reconciliationRepository = new InMemoryChecklistReconciliationRepository();
  });

  function buildUseCase(getTenderBusinessAnalysisUseCase: { execute: ReturnType<typeof vi.fn> }) {
    return new GetChecklistFreshnessUseCase(fakeGetTenderUseCase() as never, getTenderBusinessAnalysisUseCase as never, reconciliationRepository);
  }

  it("never 404s when no analysis has ever succeeded — reports RECONCILIATION_REQUIRED with undefined versions", async () => {
    const getTenderBusinessAnalysisUseCase = { execute: vi.fn(async () => { throw new TenderBusinessAnalysisNotFoundError(); }) };
    const useCase = buildUseCase(getTenderBusinessAnalysisUseCase);

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result).toEqual({ analysisVersion: undefined, analysisFreshness: undefined, lastReconciledAnalysisVersion: undefined, checklistFreshness: ChecklistFreshness.ReconciliationRequired });
  });

  it("propagates any error other than TenderBusinessAnalysisNotFoundError (never silently swallowed)", async () => {
    const boom = new Error("boom");
    const getTenderBusinessAnalysisUseCase = { execute: vi.fn(async () => { throw boom; }) };
    const useCase = buildUseCase(getTenderBusinessAnalysisUseCase);

    await expect(useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "BID_MANAGER" })).rejects.toThrow(boom);
  });

  it("reports CURRENT when the checklist was last reconciled against the latest analysis version", async () => {
    const getTenderBusinessAnalysisUseCase = { execute: vi.fn(async () => ({ analysisVersion: 3, analysisFreshness: "CURRENT" })) };
    await reconciliationRepository.upsert({ id: "recon-1", organizationId: ORG, tenderId: TENDER, analysisVersion: 3, dceRevision: 2, reconciledByUserId: "user-1", occurredAt: new Date("2026-01-01T00:00:00.000Z") });
    const useCase = buildUseCase(getTenderBusinessAnalysisUseCase);

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result).toEqual({ analysisVersion: 3, analysisFreshness: "CURRENT", lastReconciledAnalysisVersion: 3, checklistFreshness: ChecklistFreshness.Current });
  });

  it("reports RECONCILIATION_REQUIRED when a newer analysis exists than the last reconciled checklist — even if the analysis itself is CURRENT (mission §31: the two signals are orthogonal)", async () => {
    const getTenderBusinessAnalysisUseCase = { execute: vi.fn(async () => ({ analysisVersion: 4, analysisFreshness: "CURRENT" })) };
    await reconciliationRepository.upsert({ id: "recon-1", organizationId: ORG, tenderId: TENDER, analysisVersion: 3, dceRevision: 2, reconciledByUserId: "user-1", occurredAt: new Date("2026-01-01T00:00:00.000Z") });
    const useCase = buildUseCase(getTenderBusinessAnalysisUseCase);

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.analysisFreshness).toBe("CURRENT");
    expect(result.checklistFreshness).toBe(ChecklistFreshness.ReconciliationRequired);
  });

  it("reports RECONCILIATION_REQUIRED when an analysis exists but the checklist has never been reconciled at all", async () => {
    const getTenderBusinessAnalysisUseCase = { execute: vi.fn(async () => ({ analysisVersion: 1, analysisFreshness: "CURRENT" })) };
    const useCase = buildUseCase(getTenderBusinessAnalysisUseCase);

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.lastReconciledAnalysisVersion).toBeUndefined();
    expect(result.checklistFreshness).toBe(ChecklistFreshness.ReconciliationRequired);
  });

  // BLOQUANT — correctif audit P1-FIXB-001 : la Checklist a bien été réconciliée contre la
  // DERNIÈRE analysisVersion disponible (les versions correspondent exactement), mais CETTE
  // analyse est elle-même STALE vis-à-vis du DCE courant (un rafraîchissement du DCE a eu lieu
  // sans qu'une nouvelle analyse n'ait encore réussi). Avant ce correctif, `computeChecklistFreshness`
  // ne comparait que les `analysisVersion` et ignorait `analysisFreshness`, ce qui produisait un
  // faux `CURRENT` — exactement le scénario "réconciliation contre une analyse déjà obsolète,
  // rapportée comme à jour" signalé par l'audit.
  it("never reports CURRENT when the checklist was reconciled against an analysis version that is itself STALE (audit P1-FIXB-001)", async () => {
    const getTenderBusinessAnalysisUseCase = { execute: vi.fn(async () => ({ analysisVersion: 10, analysisFreshness: "STALE" })) };
    await reconciliationRepository.upsert({ id: "recon-1", organizationId: ORG, tenderId: TENDER, analysisVersion: 10, dceRevision: 10, reconciledByUserId: "user-1", occurredAt: new Date("2026-01-01T00:00:00.000Z") });
    const useCase = buildUseCase(getTenderBusinessAnalysisUseCase);

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.analysisVersion).toBe(10);
    expect(result.lastReconciledAnalysisVersion).toBe(10);
    expect(result.analysisFreshness).toBe("STALE");
    expect(result.checklistFreshness).toBe(ChecklistFreshness.ReconciliationRequired);
  });

  it("never reports CURRENT when analysisFreshness is UNKNOWN, even if the versions match (never assume current on an unresolved signal)", async () => {
    const getTenderBusinessAnalysisUseCase = { execute: vi.fn(async () => ({ analysisVersion: 5, analysisFreshness: "UNKNOWN" })) };
    await reconciliationRepository.upsert({ id: "recon-1", organizationId: ORG, tenderId: TENDER, analysisVersion: 5, dceRevision: undefined, reconciledByUserId: "user-1", occurredAt: new Date("2026-01-01T00:00:00.000Z") });
    const useCase = buildUseCase(getTenderBusinessAnalysisUseCase);

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "user-1", actorRole: "BID_MANAGER" });

    expect(result.checklistFreshness).toBe(ChecklistFreshness.ReconciliationRequired);
  });
});
