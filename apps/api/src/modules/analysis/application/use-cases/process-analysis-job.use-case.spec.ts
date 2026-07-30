import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { AnalysisJob } from "../../domain/analysis-job.aggregate";
import { AnalysisScope } from "../../domain/analysis-scope";
import { AiAuthenticationFailedError, AiProviderNotConfiguredError, AiRateLimitedError } from "../../domain/errors";
import type { AnalysisConfig } from "../../infrastructure/analysis-config";
import {
  FakeAIProvider,
  FakeAIProviderRegistry,
  FixedClock,
  InMemoryAnalysisAttemptRepository,
  InMemoryAnalysisJobRepository,
  InMemoryAuditLogWriter,
  StaticPromptTemplate,
} from "../../test-support/fakes";
import { ProcessAnalysisJobUseCase } from "./process-analysis-job.use-case";

const ORG = randomUUID();
const NOW = new Date("2026-07-29T14:00:00Z");

const BASE_CONFIG: AnalysisConfig = { aiModel: "fake-model", aiTimeoutMs: 2000, aiMaxRetries: 2, aiRetryDelayMs: 0 };

async function seedQueuedJob(jobRepository: InMemoryAnalysisJobRepository): Promise<AnalysisJob> {
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
  return job;
}

describe("ProcessAnalysisJobUseCase", () => {
  let jobRepository: InMemoryAnalysisJobRepository;
  let attemptRepository: InMemoryAnalysisAttemptRepository;
  let auditLogWriter: InMemoryAuditLogWriter;

  beforeEach(() => {
    attemptRepository = new InMemoryAnalysisAttemptRepository();
    // Correction P1-02 — `jobRepository` coordonne avec `attemptRepository` pour reproduire
    // l'atomicité job+historique de `PrismaAnalysisJobRepository.finalizeAttempt`.
    jobRepository = new InMemoryAnalysisJobRepository(attemptRepository);
    auditLogWriter = new InMemoryAuditLogWriter();
  });

  function buildUseCase(provider: FakeAIProvider, config: AnalysisConfig = BASE_CONFIG): ProcessAnalysisJobUseCase {
    return new ProcessAnalysisJobUseCase(
      jobRepository,
      new FakeAIProviderRegistry(provider),
      new StaticPromptTemplate(),
      auditLogWriter,
      config,
      new FixedClock(NOW),
    );
  }

  it("finalizes SUCCEEDED with tokens/resultSummary and records one attempt", async () => {
    const job = await seedQueuedJob(jobRepository);
    const provider = new FakeAIProvider([{ kind: "success", usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 } }]);

    await buildUseCase(provider).execute({ organizationId: ORG, jobId: job.id });

    const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
    expect(stored!.status).toBe("SUCCEEDED");
    expect(stored!.totalTokenCount).toBe(10);
    expect(stored!.resultSummary).toBe("technical pipeline check ok");

    const attempts = await attemptRepository.listByJobId({ organizationId: ORG, jobId: job.id });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.outcome).toBe("SUCCEEDED");
    expect(attempts[0]!.trigger).toBe("MANUAL");
    expect(auditLogWriter.entries.map((e) => e.action)).toContain("analysis.completed");
  });

  it("fails with AI_PROVIDER_NOT_CONFIGURED when no provider is registered, without ever calling it", async () => {
    const job = await seedQueuedJob(jobRepository);
    const registry = { resolve: () => { throw new AiProviderNotConfiguredError({ reason: "no AI_PROVIDER configured" }); } };

    await new ProcessAnalysisJobUseCase(
      jobRepository,
      registry,
      new StaticPromptTemplate(),
      auditLogWriter,
      BASE_CONFIG,
      new FixedClock(NOW),
    ).execute({ organizationId: ORG, jobId: job.id });

    const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
    expect(stored!.status).toBe("FAILED");
    expect(stored!.errorCode).toBe("AI_PROVIDER_NOT_CONFIGURED");
  });

  it("retries a retryable provider error internally and eventually succeeds within the same attempt", async () => {
    const job = await seedQueuedJob(jobRepository);
    const provider = new FakeAIProvider([{ kind: "error", error: new AiRateLimitedError() }, { kind: "success" }]);

    await buildUseCase(provider, { ...BASE_CONFIG, aiMaxRetries: 2, aiRetryDelayMs: 0 }).execute({ organizationId: ORG, jobId: job.id });

    const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
    expect(stored!.status).toBe("SUCCEEDED");
    expect(provider.calls).toHaveLength(2);

    const attempts = await attemptRepository.listByJobId({ organizationId: ORG, jobId: job.id });
    expect(attempts).toHaveLength(1); // un seul AnalysisAttempt malgré 2 appels provider internes
    expect(attempts[0]!.retryCount).toBe(1);
  });

  it("does not retry a non-retryable provider error (authentication failure)", async () => {
    const job = await seedQueuedJob(jobRepository);
    const provider = new FakeAIProvider([{ kind: "error", error: new AiAuthenticationFailedError() }]);

    await buildUseCase(provider).execute({ organizationId: ORG, jobId: job.id });

    expect(provider.calls).toHaveLength(1);
    const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
    expect(stored!.status).toBe("FAILED");
    expect(stored!.errorCode).toBe("AI_AUTHENTICATION_FAILED");
  });

  it("fails with AI_SCHEMA_VALIDATION_FAILED when the provider returns content that does not match the output schema", async () => {
    const job = await seedQueuedJob(jobRepository);
    const provider = new FakeAIProvider([{ kind: "success", content: "not json at all" }]);

    await buildUseCase(provider).execute({ organizationId: ORG, jobId: job.id });

    const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
    expect(stored!.status).toBe("FAILED");
    expect(stored!.errorCode).toBe("AI_SCHEMA_VALIDATION_FAILED");
  });

  it("skips (no-op) a job that is no longer QUEUED — never double-processes it", async () => {
    const job = await seedQueuedJob(jobRepository);
    job.reserve(NOW); // déjà PROCESSING (simule un dispatch concurrent déjà en cours)
    await jobRepository.save(job);

    const provider = new FakeAIProvider([{ kind: "success" }]);
    await buildUseCase(provider).execute({ organizationId: ORG, jobId: job.id });

    expect(provider.calls).toHaveLength(0);
    const attempts = await attemptRepository.listByJobId({ organizationId: ORG, jobId: job.id });
    expect(attempts).toHaveLength(0);
  });

  it("never leaves the job terminal without a matching AnalysisAttempt (correction audit Codex P1-02)", async () => {
    const job = await seedQueuedJob(jobRepository);
    attemptRepository.failNextCreate = true; // simule une panne de persistance de l'historique
    const provider = new FakeAIProvider([{ kind: "success" }]);

    await buildUseCase(provider).execute({ organizationId: ORG, jobId: job.id });

    // La finalisation entière a été annulée : le job n'est PAS passé à SUCCEEDED sans historique —
    // il reste PROCESSING, récupérable par un retry manuel.
    const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
    expect(stored!.status).toBe("PROCESSING");
    const attempts = await attemptRepository.listByJobId({ organizationId: ORG, jobId: job.id });
    expect(attempts).toHaveLength(0);
  });

  it("marks a retry attempt with trigger RETRY once attemptCount > 1", async () => {
    const job = await seedQueuedJob(jobRepository);
    const failingProvider = new FakeAIProvider([{ kind: "error", error: new AiAuthenticationFailedError() }]);
    await buildUseCase(failingProvider).execute({ organizationId: ORG, jobId: job.id });

    const failed = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
    expect(failed!.status).toBe("FAILED");
    failed!.resetForRetry(NOW); // seule transition sortante valide de FAILED (RetryAnalysisUseCase)
    await jobRepository.save(failed!);

    await buildUseCase(new FakeAIProvider([{ kind: "success" }])).execute({ organizationId: ORG, jobId: job.id });
    const attempts = await attemptRepository.listByJobId({ organizationId: ORG, jobId: job.id });
    expect(attempts).toHaveLength(2);
    expect(attempts[0]!.trigger).toBe("MANUAL");
    expect(attempts[1]!.trigger).toBe("RETRY");
  });
});
