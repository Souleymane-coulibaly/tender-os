import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { ClientAssignment } from "../../../client-portfolio/domain/client-assignment.entity";
import { ClientRole } from "../../../client-portfolio/domain/client-role";
import { InMemoryClientAssignmentRepository } from "../../../client-portfolio/test-support/fakes";
import { GetTenderUseCase } from "../../../tenders";
import { Tender } from "../../../tenders/domain/tender.aggregate";
import { TenderId } from "../../../tenders/domain/tender-id.value-object";
import { InMemoryTenderRepository } from "../../../tenders/test-support/fakes";
import { AnalysisJob } from "../../domain/analysis-job.aggregate";
import { AnalysisScope } from "../../domain/analysis-scope";
import { AnalysisNotRetryableError, AnalysisRetryLimitExceededError } from "../../domain/errors";
import type { AnalysisConfig } from "../../infrastructure/analysis-config";
import { FixedClock, InMemoryAnalysisJobRepository, InMemoryAuditLogWriter, RecordingAnalysisDispatcher } from "../../test-support/fakes";
import { RetryAnalysisUseCase } from "./retry-analysis.use-case";

const ORG = randomUUID();
const NOW = new Date("2026-07-29T14:00:00Z");
const ACTOR_ID = "u";

const CONFIG: AnalysisConfig = {
  aiModel: "m",
  aiModelForDocumentAnalysis: "m",
  aiModelForTenderConsolidation: "m",
  aiTimeoutMs: 1000,
  aiMaxRetries: 1,
  aiRetryDelayMs: 0,
};

describe("RetryAnalysisUseCase", () => {
  let jobRepository: InMemoryAnalysisJobRepository;
  let dispatcher: RecordingAnalysisDispatcher;
  let tenderRepository: InMemoryTenderRepository;
  let clientAssignmentRepository: InMemoryClientAssignmentRepository;

  beforeEach(() => {
    jobRepository = new InMemoryAnalysisJobRepository();
    dispatcher = new RecordingAnalysisDispatcher();
    tenderRepository = new InMemoryTenderRepository();
    clientAssignmentRepository = new InMemoryClientAssignmentRepository();
  });

  // "u" est affecté en CONTRIBUTOR sur le client du Tender de ce job (mission Sprint 5.1 —
  // même acteur MEMBER-tier, jamais un accès implicite : la relecture centralisée
  // `GetTenderUseCase` exige une affectation explicite, voir `retry-analysis.use-case.ts`).
  async function buildFailedJob(): Promise<AnalysisJob> {
    const tenderId = randomUUID();
    const clientAccountId = randomUUID();
    await tenderRepository.seed(
      Tender.create({ id: TenderId.from(tenderId), organizationId: ORG, clientAccountId, title: "Marche", createdBy: ACTOR_ID, occurredAt: NOW }),
    );
    await clientAssignmentRepository.create(
      ClientAssignment.create({ id: randomUUID(), organizationId: ORG, clientAccountId, userId: ACTOR_ID, role: ClientRole.Contributor, createdBy: ACTOR_ID, occurredAt: NOW }),
    );

    const job = AnalysisJob.create({
      id: randomUUID(),
      organizationId: ORG,
      tenderId,
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

  function buildUseCase(config: AnalysisConfig = CONFIG): RetryAnalysisUseCase {
    const getTenderUseCase = new GetTenderUseCase(tenderRepository, new AssertClientAccessUseCase(clientAssignmentRepository));
    return new RetryAnalysisUseCase(jobRepository, new InMemoryAuditLogWriter(), dispatcher, config, new FixedClock(NOW), getTenderUseCase);
  }

  it("resets a FAILED job to QUEUED, keeping the same id/version, and dispatches it", async () => {
    const job = await buildFailedJob();
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
    const job = await buildFailedJob();
    job.resetForRetry({ triggeredByRole: "OWNER" }, NOW); // -> QUEUED
    await jobRepository.save(job);

    const useCase = buildUseCase();
    await expect(useCase.execute({ organizationId: ORG, jobId: job.id, actorId: "u", actorRole: "CONTRIBUTOR" })).rejects.toBeInstanceOf(
      AnalysisNotRetryableError,
    );
  });

  it("refuses once the retry limit is exceeded", async () => {
    const job = await buildFailedJob(); // attemptCount = 1
    await jobRepository.save(job);

    const useCase = buildUseCase({ ...CONFIG, aiMaxRetries: 0 }); // 1 + 0 = 1 max attempt total
    await expect(useCase.execute({ organizationId: ORG, jobId: job.id, actorId: "u", actorRole: "CONTRIBUTOR" })).rejects.toBeInstanceOf(
      AnalysisRetryLimitExceededError,
    );
  });
});
