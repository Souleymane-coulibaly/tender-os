import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetTenderUseCase } from "../../../tenders";
import {
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

  function buildUseCase(): StartTenderAnalysisUseCase {
    return new StartTenderAnalysisUseCase(
      jobRepository,
      new InMemoryAuditLogWriter(),
      dispatcher,
      new FixedClock(NOW),
      getTenderUseCase as unknown as GetTenderUseCase,
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
});
