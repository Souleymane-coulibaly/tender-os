import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { AnalysisJob } from "../../domain/analysis-job.aggregate";
import { AnalysisScope } from "../../domain/analysis-scope";
import { FixedClock, InMemoryAnalysisJobRepository, RecordingAnalysisDispatcher } from "../../test-support/fakes";
import { ReclaimStaleAnalysisJobsUseCase } from "./reclaim-stale-analysis-jobs.use-case";

const ORG = randomUUID();
const NOW = new Date("2026-07-29T14:00:00Z");
const TEN_MINUTES_MS = 10 * 60 * 1000;

function buildJob(input: { status: "QUEUED" | "PROCESSING"; updatedAt: Date }): AnalysisJob {
  const job = AnalysisJob.create({
    id: randomUUID(),
    organizationId: ORG,
    tenderId: randomUUID(),
    scope: AnalysisScope.Tender,
    analysisVersion: 1,
    promptVersion: 1,
    occurredAt: input.updatedAt,
  });
  job.queue(input.updatedAt);
  if (input.status === "PROCESSING") {
    job.reserve(input.updatedAt);
  }
  return job;
}

describe("ReclaimStaleAnalysisJobsUseCase", () => {
  let jobRepository: InMemoryAnalysisJobRepository;
  let dispatcher: RecordingAnalysisDispatcher;

  beforeEach(() => {
    jobRepository = new InMemoryAnalysisJobRepository();
    dispatcher = new RecordingAnalysisDispatcher();
  });

  function buildUseCase(now: Date = NOW): ReclaimStaleAnalysisJobsUseCase {
    return new ReclaimStaleAnalysisJobsUseCase(jobRepository, dispatcher, new FixedClock(now));
  }

  it("BLOQUANT (mission PARTIE F) — resets a job stuck PROCESSING beyond the threshold back to QUEUED and re-dispatches it", async () => {
    const staleUpdatedAt = new Date(NOW.getTime() - TEN_MINUTES_MS - 1);
    const job = buildJob({ status: "PROCESSING", updatedAt: staleUpdatedAt });
    await jobRepository.save(job);

    const result = await buildUseCase().execute({ staleThresholdMs: TEN_MINUTES_MS, batchSize: 50 });

    expect(result.reclaimed).toBe(1);
    const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
    expect(stored?.status).toBe("QUEUED");
    expect(dispatcher.dispatched).toEqual([{ organizationId: ORG, jobId: job.id }]);
  });

  it("never touches a PROCESSING job still within the threshold (still legitimately in flight)", async () => {
    const recentUpdatedAt = new Date(NOW.getTime() - 1000);
    const job = buildJob({ status: "PROCESSING", updatedAt: recentUpdatedAt });
    await jobRepository.save(job);

    const result = await buildUseCase().execute({ staleThresholdMs: TEN_MINUTES_MS, batchSize: 50 });

    expect(result.reclaimed).toBe(0);
    const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
    expect(stored?.status).toBe("PROCESSING");
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it("never touches a QUEUED job (only PROCESSING is a stuck-state candidate)", async () => {
    const staleUpdatedAt = new Date(NOW.getTime() - TEN_MINUTES_MS - 1);
    const job = buildJob({ status: "QUEUED", updatedAt: staleUpdatedAt });
    await jobRepository.save(job);

    const result = await buildUseCase().execute({ staleThresholdMs: TEN_MINUTES_MS, batchSize: 50 });

    expect(result.reclaimed).toBe(0);
    expect(dispatcher.dispatched).toHaveLength(0);
  });
});
