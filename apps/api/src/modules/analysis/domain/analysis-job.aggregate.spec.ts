import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AnalysisJob } from "./analysis-job.aggregate";
import { AnalysisScope } from "./analysis-scope";
import { AnalysisStatus } from "./analysis-status";
import { InvalidAnalysisStatusTransitionError } from "./errors";

const NOW = new Date("2026-07-29T14:00:00Z");
const LATER = new Date("2026-07-29T14:00:05Z");

function createDocumentJob(): AnalysisJob {
  return AnalysisJob.create({
    id: randomUUID(),
    organizationId: randomUUID(),
    tenderId: randomUUID(),
    dceId: randomUUID(),
    documentId: randomUUID(),
    scope: AnalysisScope.Document,
    analysisVersion: 1,
    promptVersion: 1,
    extractionVersion: 1,
    inputChecksum: "abc",
    occurredAt: NOW,
  });
}

describe("AnalysisJob", () => {
  it("derives targetId from documentId for a DOCUMENT scope job", () => {
    const documentId = randomUUID();
    const job = AnalysisJob.create({
      id: randomUUID(),
      organizationId: randomUUID(),
      tenderId: randomUUID(),
      dceId: randomUUID(),
      documentId,
      scope: AnalysisScope.Document,
      analysisVersion: 1,
      promptVersion: 1,
      occurredAt: NOW,
    });
    expect(job.targetId).toBe(documentId);
    expect(job.status).toBe(AnalysisStatus.Pending);
  });

  it("derives targetId from tenderId for a TENDER scope job", () => {
    const tenderId = randomUUID();
    const job = AnalysisJob.create({
      id: randomUUID(),
      organizationId: randomUUID(),
      tenderId,
      scope: AnalysisScope.Tender,
      analysisVersion: 1,
      promptVersion: 1,
      occurredAt: NOW,
    });
    expect(job.targetId).toBe(tenderId);
    expect(job.documentId).toBeUndefined();
  });

  it("moves through queue -> reserve -> complete, incrementing attemptCount once per reservation", () => {
    const job = createDocumentJob();
    job.queue(NOW);
    expect(job.status).toBe(AnalysisStatus.Queued);

    job.reserve(NOW);
    expect(job.status).toBe(AnalysisStatus.Processing);
    expect(job.attemptCount).toBe(1);

    job.complete(
      { outcome: AnalysisStatus.Succeeded, provider: "FAKE", model: "fake-model", durationMs: 42, resultSummary: "ok" },
      LATER,
    );
    expect(job.status).toBe(AnalysisStatus.Succeeded);
    expect(job.resultSummary).toBe("ok");
    expect(job.completedAt).toEqual(LATER);
  });

  it("rejects reserve() from PENDING (must be queued first)", () => {
    const job = createDocumentJob();
    expect(() => job.reserve(NOW)).toThrow(InvalidAnalysisStatusTransitionError);
  });

  it("fail() clears no prior result and records the error", () => {
    const job = createDocumentJob();
    job.queue(NOW);
    job.reserve(NOW);
    job.fail({ errorCode: "AI_TIMEOUT", errorMessage: "boom" }, LATER);
    expect(job.status).toBe(AnalysisStatus.Failed);
    expect(job.errorCode).toBe("AI_TIMEOUT");
  });

  it("resetForRetry only transitions FAILED -> QUEUED and clears the error", () => {
    const job = createDocumentJob();
    job.queue(NOW);
    job.reserve(NOW);
    job.fail({ errorCode: "AI_TIMEOUT", errorMessage: "boom" }, LATER);

    job.resetForRetry({ triggeredByRole: "OWNER" }, LATER);
    expect(job.status).toBe(AnalysisStatus.Queued);
    expect(job.errorCode).toBeUndefined();
    expect(job.errorMessage).toBeUndefined();
    expect(job.triggeredByRole).toBe("OWNER");
  });

  it("resetForRetry rejects a non-FAILED job", () => {
    const job = createDocumentJob();
    job.queue(NOW);
    expect(() => job.resetForRetry({ triggeredByRole: "OWNER" }, NOW)).toThrow(InvalidAnalysisStatusTransitionError);
  });

  it("cancel() works from PENDING, QUEUED and PROCESSING but never from a terminal status", () => {
    const pending = createDocumentJob();
    pending.cancel(NOW);
    expect(pending.status).toBe(AnalysisStatus.Cancelled);

    const succeeded = createDocumentJob();
    succeeded.queue(NOW);
    succeeded.reserve(NOW);
    succeeded.complete({ outcome: AnalysisStatus.Succeeded, provider: "FAKE", model: "m", durationMs: 1 }, LATER);
    expect(() => succeeded.cancel(LATER)).toThrow(InvalidAnalysisStatusTransitionError);
  });

  it("a second reserve() without a prior retry is rejected (no double-processing of the same reservation)", () => {
    const job = createDocumentJob();
    job.queue(NOW);
    job.reserve(NOW);
    expect(() => job.reserve(NOW)).toThrow(InvalidAnalysisStatusTransitionError);
  });
});
