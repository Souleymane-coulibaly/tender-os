import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AnalysisJob } from "../../domain/analysis-job.aggregate";
import { AnalysisScope } from "../../domain/analysis-scope";
import { AnalysisNotRetryableError, AnalysisRetryLimitExceededError } from "../../domain/errors";
import { assertAnalysisIsRetryable } from "./analysis-retry.policy";

const NOW = new Date("2026-07-29T14:00:00Z");

function buildJob(): AnalysisJob {
  return AnalysisJob.create({
    id: randomUUID(),
    organizationId: randomUUID(),
    tenderId: randomUUID(),
    scope: AnalysisScope.Tender,
    analysisVersion: 1,
    promptVersion: 1,
    occurredAt: NOW,
  });
}

describe("assertAnalysisIsRetryable", () => {
  it("rejects a job that is not FAILED", () => {
    const job = buildJob();
    job.queue(NOW);
    expect(() => assertAnalysisIsRetryable(job, 2)).toThrow(AnalysisNotRetryableError);
  });

  it("allows a FAILED job under the retry limit", () => {
    const job = buildJob();
    job.queue(NOW);
    job.reserve(NOW);
    job.fail({ errorCode: "AI_TIMEOUT", errorMessage: "boom" }, NOW);
    expect(() => assertAnalysisIsRetryable(job, 2)).not.toThrow();
  });

  it("rejects once attemptCount reaches 1 + maxRetries", () => {
    const job = buildJob();
    job.queue(NOW);
    job.reserve(NOW); // attemptCount = 1
    job.fail({ errorCode: "AI_TIMEOUT", errorMessage: "boom" }, NOW);
    job.resetForRetry(NOW);
    job.reserve(NOW); // attemptCount = 2 (1 + maxRetries with maxRetries=1)
    job.fail({ errorCode: "AI_TIMEOUT", errorMessage: "boom" }, NOW);

    expect(() => assertAnalysisIsRetryable(job, 1)).toThrow(AnalysisRetryLimitExceededError);
  });
});
