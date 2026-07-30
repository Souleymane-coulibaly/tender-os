import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { AnalysisJob } from "../../domain/analysis-job.aggregate";
import { AnalysisScope } from "../../domain/analysis-scope";
import { AnalysisNotRetryableError, AnalysisRetryLimitExceededError } from "../../domain/errors";
import type { AnalysisConfig } from "../../infrastructure/analysis-config";
import { FixedClock, InMemoryAnalysisJobRepository, InMemoryAuditLogWriter, RecordingAnalysisDispatcher } from "../../test-support/fakes";
import { RetryAnalysisUseCase } from "./retry-analysis.use-case";

const ORG = randomUUID();
const NOW = new Date("2026-07-29T14:00:00Z");

const CONFIG: AnalysisConfig = {
  aiModel: "m",
  aiModelForDocumentAnalysis: "m",
  aiModelForTenderConsolidation: "m",
  aiTimeoutMs: 1000,
  aiMaxRetries: 1,
  aiRetryDelayMs: 0,
};

function buildFailedJob(): AnalysisJob {
  const job = AnalysisJob.create({
    id: randomUUID(),
    organizationId: ORG,
    tenderId: randomUUID(),
    scope: AnalysisScope.Tender,
    analysisVersion: 1,
    promptVersion: 1,
    occurredAt: NOW,
  });
  job.queue(NOW);
  job.reserve(NOW);
  job.fail({ errorCode: "AI_TIMEOUT", errorMessage: "boom" }, NOW);
  return job;
}

describe("RetryAnalysisUseCase", () => {
  let jobRepository: InMemoryAnalysisJobRepository;
  let dispatcher: RecordingAnalysisDispatcher;

  beforeEach(() => {
    jobRepository = new InMemoryAnalysisJobRepository();
    dispatcher = new RecordingAnalysisDispatcher();
  });

  function buildUseCase(config: AnalysisConfig = CONFIG): RetryAnalysisUseCase {
    return new RetryAnalysisUseCase(jobRepository, new InMemoryAuditLogWriter(), dispatcher, config, new FixedClock(NOW));
  }

  it("resets a FAILED job to QUEUED, keeping the same id/version, and dispatches it", async () => {
    const job = buildFailedJob();
    await jobRepository.save(job);

    const useCase = buildUseCase();
    const result = await useCase.execute({ organizationId: ORG, jobId: job.id, actorId: "u", actorRole: "CONTRIBUTOR" });

    expect(result.id).toBe(job.id);
    expect(result.status).toBe("QUEUED");
    expect(result.analysisVersion).toBe(1);
    expect(dispatcher.dispatched).toHaveLength(1);

    const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
    expect(stored?.triggeredByRole).toBe("CONTRIBUTOR");
  });

  it("refuses to retry a job that is not FAILED", async () => {
    const job = buildFailedJob();
    job.resetForRetry({ triggeredByRole: "OWNER" }, NOW); // -> QUEUED
    await jobRepository.save(job);

    const useCase = buildUseCase();
    await expect(useCase.execute({ organizationId: ORG, jobId: job.id, actorId: "u", actorRole: "CONTRIBUTOR" })).rejects.toBeInstanceOf(
      AnalysisNotRetryableError,
    );
  });

  it("refuses once the retry limit is exceeded", async () => {
    const job = buildFailedJob(); // attemptCount = 1
    await jobRepository.save(job);

    const useCase = buildUseCase({ ...CONFIG, aiMaxRetries: 0 }); // 1 + 0 = 1 max attempt total
    await expect(useCase.execute({ organizationId: ORG, jobId: job.id, actorId: "u", actorRole: "CONTRIBUTOR" })).rejects.toBeInstanceOf(
      AnalysisRetryLimitExceededError,
    );
  });
});
