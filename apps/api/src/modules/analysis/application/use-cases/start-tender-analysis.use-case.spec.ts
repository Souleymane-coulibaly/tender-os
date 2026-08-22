import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetTenderUseCase } from "../../../tenders";
import { AnalysisScope } from "../../domain/analysis-scope";
import {
  FakeOutboxWriter,
  FixedClock,
  InMemoryAnalysisJobRepository,
  InMemoryAuditLogWriter,
  RecordingAnalysisDispatcher,
} from "../../test-support/fakes";
import { StartTenderAnalysisUseCase } from "./start-tender-analysis.use-case";

const ORG = "11111111-1111-1111-1111-111111111111";
const TENDER = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-07-29T14:00:00Z");

describe("StartTenderAnalysisUseCase", () => {
  let jobRepository: InMemoryAnalysisJobRepository;
  let dispatcher: RecordingAnalysisDispatcher;
  let getTenderUseCase: { execute: ReturnType<typeof vi.fn> };

  function fakeEntitlementService(allowed = true) {
    return {
      canOperateOnTender: vi.fn(async () => allowed),
      runTenderOperationEntitled: vi.fn(async (_input: unknown, operation: () => Promise<unknown>) => {
        if (!allowed) {
          throw Object.assign(new Error("not entitled"), { code: "TENDER_OPERATION_NOT_ENTITLED" });
        }
        return operation();
      }),
    };
  }

  function buildUseCase(entitlementService?: ReturnType<typeof fakeEntitlementService>): StartTenderAnalysisUseCase {
    return new StartTenderAnalysisUseCase(
      jobRepository,
      new InMemoryAuditLogWriter(),
      dispatcher,
      new FakeOutboxWriter(),
      new FixedClock(NOW),
      getTenderUseCase as unknown as GetTenderUseCase,
      (entitlementService ?? fakeEntitlementService()) as never,
    );
  }

  beforeEach(() => {
    jobRepository = new InMemoryAnalysisJobRepository();
    dispatcher = new RecordingAnalysisDispatcher();
    getTenderUseCase = { execute: vi.fn(async () => ({ id: TENDER, organizationId: ORG })) };
  });

  it("creates a TENDER-scoped job with no document/dce and dispatches it", async () => {
    const useCase = buildUseCase();
    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "u", actorRole: "BID_MANAGER" });

    expect(result.scope).toBe("TENDER");
    expect(result.documentId).toBeUndefined();
    expect(result.dceId).toBeUndefined();
    expect(result.analysisVersion).toBe(1);
    expect(dispatcher.dispatched).toHaveLength(1);
  });

  it("propagates a TENDER_NOT_FOUND from GetTenderUseCase unchanged", async () => {
    getTenderUseCase.execute = vi.fn(async () => {
      throw Object.assign(new Error("not found"), { code: "TENDER_NOT_FOUND" });
    });
    const useCase = buildUseCase();
    await expect(useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "u", actorRole: "BID_MANAGER" })).rejects.toMatchObject({
      code: "TENDER_NOT_FOUND",
    });
  });

  it("refuses a double trigger for the same tender", async () => {
    const useCase = buildUseCase();
    await useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "u", actorRole: "BID_MANAGER" });
    await expect(useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "u", actorRole: "BID_MANAGER" })).rejects.toMatchObject({
      code: "ANALYSIS_ALREADY_RUNNING",
    });
  });

  it("Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 1, mission TEST 2 — refuses (never creates a job) when the organization has no entitlement to operate on this tender", async () => {
    const entitlementService = fakeEntitlementService(false);
    const useCase = buildUseCase(entitlementService);

    await expect(useCase.execute({ organizationId: ORG, tenderId: TENDER, actorId: "u", actorRole: "BID_MANAGER" })).rejects.toMatchObject({
      code: "TENDER_OPERATION_NOT_ENTITLED",
    });

    expect(entitlementService.runTenderOperationEntitled).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG, tenderId: TENDER }), expect.any(Function));
    expect(dispatcher.dispatched).toHaveLength(0);
    const jobs = await jobRepository.listByTarget({ organizationId: ORG, scope: AnalysisScope.Tender, targetId: TENDER, limit: 10, offset: 0 });
    expect(jobs.total).toBe(0);
  });
});
