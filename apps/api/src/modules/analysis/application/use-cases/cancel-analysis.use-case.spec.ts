import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { GetTenderUseCase } from "../../../tenders";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { InMemoryClientAssignmentRepository } from "../../../client-portfolio/test-support/fakes";
import { InMemoryTenderRepository } from "../../../tenders/test-support/fakes";
import { Tender } from "../../../tenders/domain/tender.aggregate";
import { TenderId } from "../../../tenders/domain/tender-id.value-object";
import { AnalysisJob } from "../../domain/analysis-job.aggregate";
import { AnalysisScope } from "../../domain/analysis-scope";
import { AnalysisNotCancellableError } from "../../domain/errors";
import { FixedClock, InMemoryAnalysisJobRepository, InMemoryAuditLogWriter } from "../../test-support/fakes";
import { CancelAnalysisUseCase } from "./cancel-analysis.use-case";

const ORG = randomUUID();
const NOW = new Date("2026-07-29T14:00:00Z");

describe("CancelAnalysisUseCase", () => {
  let jobRepository: InMemoryAnalysisJobRepository;
  let tenderRepository: InMemoryTenderRepository;

  beforeEach(() => {
    jobRepository = new InMemoryAnalysisJobRepository();
    tenderRepository = new InMemoryTenderRepository();
  });

  function buildUseCase(): CancelAnalysisUseCase {
    const getTenderUseCase = new GetTenderUseCase(tenderRepository, new AssertClientAccessUseCase(new InMemoryClientAssignmentRepository()));
    return new CancelAnalysisUseCase(jobRepository, new InMemoryAuditLogWriter(), new FixedClock(NOW), getTenderUseCase);
  }

  async function seedJobWithTender(): Promise<AnalysisJob> {
    const tenderId = randomUUID();
    await tenderRepository.seed(
      Tender.create({ id: TenderId.from(tenderId), organizationId: ORG, clientAccountId: randomUUID(), title: "Marche", createdBy: "u", occurredAt: NOW }),
    );
    return AnalysisJob.create({
      id: randomUUID(),
      organizationId: ORG,
      tenderId,
      scope: AnalysisScope.Tender,
      analysisVersion: 1,
      promptVersion: 1,
      occurredAt: NOW,
    });
  }

  it("cancels a QUEUED job", async () => {
    const job = await seedJobWithTender();
    job.queue(NOW);
    await jobRepository.save(job);

    const useCase = buildUseCase();
    const result = await useCase.execute({ organizationId: ORG, jobId: job.id, actorId: "u", actorRole: "OWNER" });
    expect(result.status).toBe("CANCELLED");
  });

  it("refuses to cancel a job that already reached a terminal status", async () => {
    const job = await seedJobWithTender();
    job.queue(NOW);
    job.reserve(NOW);
    job.complete({ outcome: "SUCCEEDED", provider: "FAKE", model: "m", durationMs: 1 }, NOW);
    await jobRepository.save(job);

    const useCase = buildUseCase();
    await expect(useCase.execute({ organizationId: ORG, jobId: job.id, actorId: "u", actorRole: "OWNER" })).rejects.toBeInstanceOf(
      AnalysisNotCancellableError,
    );
  });
});
