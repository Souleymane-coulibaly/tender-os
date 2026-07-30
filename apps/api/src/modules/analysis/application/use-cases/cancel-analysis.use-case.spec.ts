import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { AnalysisJob } from "../../domain/analysis-job.aggregate";
import { AnalysisScope } from "../../domain/analysis-scope";
import { AnalysisNotCancellableError } from "../../domain/errors";
import { FixedClock, InMemoryAnalysisJobRepository, InMemoryAuditLogWriter } from "../../test-support/fakes";
import { CancelAnalysisUseCase } from "./cancel-analysis.use-case";

const ORG = randomUUID();
const NOW = new Date("2026-07-29T14:00:00Z");

describe("CancelAnalysisUseCase", () => {
  let jobRepository: InMemoryAnalysisJobRepository;

  beforeEach(() => {
    jobRepository = new InMemoryAnalysisJobRepository();
  });

  function buildUseCase(): CancelAnalysisUseCase {
    return new CancelAnalysisUseCase(jobRepository, new InMemoryAuditLogWriter(), new FixedClock(NOW));
  }

  it("cancels a QUEUED job", async () => {
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
    await jobRepository.save(job);

    const useCase = buildUseCase();
    const result = await useCase.execute({ organizationId: ORG, jobId: job.id, actorId: "u", actorRole: "CONTRIBUTOR" });
    expect(result.status).toBe("CANCELLED");
  });

  it("refuses to cancel a job that already reached a terminal status", async () => {
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
    job.complete({ outcome: "SUCCEEDED", provider: "FAKE", model: "m", durationMs: 1 }, NOW);
    await jobRepository.save(job);

    const useCase = buildUseCase();
    await expect(useCase.execute({ organizationId: ORG, jobId: job.id, actorId: "u", actorRole: "CONTRIBUTOR" })).rejects.toBeInstanceOf(
      AnalysisNotCancellableError,
    );
  });
});
