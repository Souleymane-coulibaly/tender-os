import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiModelRouter } from "../../../ai-routing";
import { InMemoryAiModelPreferenceRepository } from "../../../ai-routing/test-support/fakes";
import { AnalysisJob } from "../../domain/analysis-job.aggregate";
import { AnalysisScope } from "../../domain/analysis-scope";
import {
  AiAuthenticationFailedError,
  AiModelRouterUnavailableError,
  AiProviderNotConfiguredError,
  AiRateLimitedError,
  AiSchemaValidationFailedError,
} from "../../domain/errors";
import type { AnalysisConfig } from "../../infrastructure/analysis-config";
import {
  FakeAIProvider,
  FakeAIProviderRegistry,
  FakeAnalysisContentResolver,
  FakeOutboxWriter,
  FixedClock,
  InMemoryAnalysisAttemptRepository,
  InMemoryAnalysisJobRepository,
  InMemoryAuditLogWriter,
  RecordingRoutingDecisionWriter,
  SequentialIdGenerator,
  ThrowingRoutingDecisionWriter,
} from "../../test-support/fakes";
import { ProcessAnalysisJobUseCase } from "./process-analysis-job.use-case";
import type { RoutingDecisionWriter } from "../ports/routing-decision-writer";

const ORG = randomUUID();
const NOW = new Date("2026-07-29T14:00:00Z");

const BASE_CONFIG: AnalysisConfig = {
  aiTimeoutMs: 2000,
  aiTimeoutMsForTenderConsolidation: 120_000,
  aiMaxRetries: 2,
  aiRetryDelayMs: 0,
};

async function seedQueuedJob(jobRepository: InMemoryAnalysisJobRepository): Promise<AnalysisJob> {
  const job = AnalysisJob.create({
    id: randomUUID(),
    organizationId: ORG,
    tenderId: randomUUID(),
    scope: AnalysisScope.Tender,
    analysisVersion: 1,
    promptVersion: 1,
    triggeredByRole: "OWNER",
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
  let outboxWriter: FakeOutboxWriter;

  beforeEach(() => {
    attemptRepository = new InMemoryAnalysisAttemptRepository();
    // Correction P1-02 — `jobRepository` coordonne avec `attemptRepository` pour reproduire
    // l'atomicité job+historique de `PrismaAnalysisJobRepository.finalizeAttempt`.
    jobRepository = new InMemoryAnalysisJobRepository(attemptRepository);
    auditLogWriter = new InMemoryAuditLogWriter();
    outboxWriter = new FakeOutboxWriter();
  });

  // Checkpoint TENDEROS-2.1-P2.3-E4.1 — un `AiModelRouter` réel (jamais `undefined`) est câblé par
  // défaut, comme en production : les tests qui ne testent pas spécifiquement le routing exercent
  // donc le vrai chemin AUTOMATIC → gpt-5.4-mini. Passer explicitement `null` simule l'absence de
  // Router (cas défensif `@Optional()`, jamais le cas réel en production).
  function buildUseCase(
    provider: FakeAIProvider,
    config: AnalysisConfig = BASE_CONFIG,
    contentResolver: FakeAnalysisContentResolver = new FakeAnalysisContentResolver(),
    routingDecisionWriter?: RoutingDecisionWriter,
    aiModelRouter: AiModelRouter | null = new AiModelRouter(new InMemoryAiModelPreferenceRepository()),
  ): ProcessAnalysisJobUseCase {
    return new ProcessAnalysisJobUseCase(
      jobRepository,
      new FakeAIProviderRegistry(provider),
      contentResolver,
      auditLogWriter,
      outboxWriter,
      config,
      new FixedClock(NOW),
      new SequentialIdGenerator(),
      routingDecisionWriter,
      aiModelRouter ?? undefined,
    );
  }

  it("finalizes SUCCEEDED with tokens/resultSummary, persists the business result, and records one attempt", async () => {
    const job = await seedQueuedJob(jobRepository);
    const provider = new FakeAIProvider([{ kind: "success", usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 } }]);
    const contentResolver = new FakeAnalysisContentResolver({ kind: "success", resultSummary: "fake business result" });

    await buildUseCase(provider, BASE_CONFIG, contentResolver).execute({ organizationId: ORG, jobId: job.id });

    const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
    expect(stored!.status).toBe("SUCCEEDED");
    expect(stored!.totalTokenCount).toBe(10);
    expect(stored!.resultSummary).toBe("fake business result");
    expect(contentResolver.persistCalls).toHaveLength(1);

    const attempts = await attemptRepository.listByJobId({ organizationId: ORG, jobId: job.id });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.outcome).toBe("SUCCEEDED");
    expect(attempts[0]!.trigger).toBe("MANUAL");
    expect(auditLogWriter.entries.map((e) => e.action)).toContain("analysis.completed");

    const eventTypes = outboxWriter.writes.flatMap((write) => write.events.map((event) => event.eventType));
    expect(eventTypes).toEqual(["DceAnalysisStarted", "DceAnalysisCompleted"]);
  });

  it("fails with AI_PROVIDER_NOT_CONFIGURED when no provider is registered, without ever calling it", async () => {
    const job = await seedQueuedJob(jobRepository);
    const registry = { resolve: () => { throw new AiProviderNotConfiguredError({ reason: "no AI_PROVIDER configured" }); } };

    await new ProcessAnalysisJobUseCase(
      jobRepository,
      registry,
      new FakeAnalysisContentResolver(),
      auditLogWriter,
      outboxWriter,
      BASE_CONFIG,
      new FixedClock(NOW),
      new SequentialIdGenerator(),
      undefined,
      new AiModelRouter(new InMemoryAiModelPreferenceRepository()),
    ).execute({ organizationId: ORG, jobId: job.id });

    const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
    expect(stored!.status).toBe("FAILED");
    expect(stored!.errorCode).toBe("AI_PROVIDER_NOT_CONFIGURED");
  });

  it("fails without calling the provider when the content resolver cannot prepare a request", async () => {
    const job = await seedQueuedJob(jobRepository);
    const provider = new FakeAIProvider([{ kind: "success" }]);
    const contentResolver = new FakeAnalysisContentResolver({
      kind: "prepare_error",
      error: new AiSchemaValidationFailedError({ reason: "no analyzed document available" }),
    });

    await buildUseCase(provider, BASE_CONFIG, contentResolver).execute({ organizationId: ORG, jobId: job.id });

    expect(provider.calls).toHaveLength(0);
    const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
    expect(stored!.status).toBe("FAILED");
    expect(stored!.errorCode).toBe("AI_SCHEMA_VALIDATION_FAILED");
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

  it("fails with AI_SCHEMA_VALIDATION_FAILED when the provider response fails structured validation, and does not retry it", async () => {
    const job = await seedQueuedJob(jobRepository);
    const provider = new FakeAIProvider([{ kind: "success", content: "not json at all" }]);
    const contentResolver = new FakeAnalysisContentResolver({
      kind: "handle_error",
      error: new AiSchemaValidationFailedError({ reason: "not valid JSON" }),
    });

    await buildUseCase(provider, BASE_CONFIG, contentResolver).execute({ organizationId: ORG, jobId: job.id });

    expect(provider.calls).toHaveLength(1);
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

  it("never leaves the job SUCCEEDED without its business result persisted (onSuccessTx failure)", async () => {
    const job = await seedQueuedJob(jobRepository);
    const provider = new FakeAIProvider([{ kind: "success" }]);
    const contentResolver = new FakeAnalysisContentResolver({ kind: "success", persistThrows: true });

    await buildUseCase(provider, BASE_CONFIG, contentResolver).execute({ organizationId: ORG, jobId: job.id });

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
    failed!.resetForRetry({ triggeredByRole: "OWNER" }, NOW); // seule transition sortante valide de FAILED (RetryAnalysisUseCase)
    await jobRepository.save(failed!);

    await buildUseCase(new FakeAIProvider([{ kind: "success" }])).execute({ organizationId: ORG, jobId: job.id });
    const attempts = await attemptRepository.listByJobId({ organizationId: ORG, jobId: job.id });
    expect(attempts).toHaveLength(2);
    expect(attempts[0]!.trigger).toBe("MANUAL");
    expect(attempts[1]!.trigger).toBe("RETRY");
  });

  describe("Checkpoint TENDEROS-2.1-P2.3-E4.1 — AiModelRouter est la SEULE autorité de sélection du modèle", () => {
    it("mission §34 TEST_DEFAULT_MINI — ANALYZE_DOCUMENT/CONSOLIDATE_TENDER_ANALYSIS resolve to gpt-5.4-mini via AUTOMATIC, no configuration required", async () => {
      const job = await seedQueuedJob(jobRepository);
      const provider = new FakeAIProvider([{ kind: "success" }]);
      const aiModelRouter = new AiModelRouter(new InMemoryAiModelPreferenceRepository());

      await buildUseCase(provider, BASE_CONFIG, new FakeAnalysisContentResolver({ kind: "success" }), undefined, aiModelRouter).execute({ organizationId: ORG, jobId: job.id });

      const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
      expect(stored!.status).toBe("SUCCEEDED");
      expect(stored!.model).toBe("gpt-5.4-mini");
    });

    it("mission §15 — AiModelRouter never receives a userId for Analysis (async job, no per-request actor — resolution stays DEFAULT, documented architectural fact)", async () => {
      const job = await seedQueuedJob(jobRepository);
      const provider = new FakeAIProvider([{ kind: "success" }]);
      const aiModelRouter = new AiModelRouter(new InMemoryAiModelPreferenceRepository());
      const resolveSpy = vi.spyOn(aiModelRouter, "resolve");

      await buildUseCase(provider, BASE_CONFIG, new FakeAnalysisContentResolver({ kind: "success" }), undefined, aiModelRouter).execute({ organizationId: ORG, jobId: job.id });

      expect(resolveSpy).toHaveBeenCalledTimes(1);
      expect(resolveSpy.mock.calls[0]![0].userId).toBeUndefined();
    });

    it("BLOQUANT — no AiModelRouter wired (defensive @Optional() case, never true in production) — fails CLEANLY as an ordinary job failure, never a silent fallback to a hardcoded model, provider is never called", async () => {
      const job = await seedQueuedJob(jobRepository);
      const provider = new FakeAIProvider([{ kind: "success" }]);

      await buildUseCase(provider, BASE_CONFIG, new FakeAnalysisContentResolver({ kind: "success" }), undefined, null).execute({ organizationId: ORG, jobId: job.id });

      expect(provider.calls).toHaveLength(0);
      const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
      expect(stored!.status).toBe("FAILED");
      expect(stored!.errorCode).toBe(new AiModelRouterUnavailableError().code);
    });
  });

  describe("Audit Codex P1-4 — persistance durable de la décision de routage", () => {
    it("creates a routing decision before the provider call, and completes it exactly once on success", async () => {
      const job = await seedQueuedJob(jobRepository);
      const provider = new FakeAIProvider([
        { kind: "success", usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 } },
      ]);
      const routingDecisionWriter = new RecordingRoutingDecisionWriter();

      await buildUseCase(provider, BASE_CONFIG, new FakeAnalysisContentResolver({ kind: "success" }), routingDecisionWriter).execute({
        organizationId: ORG,
        jobId: job.id,
      });

      expect(routingDecisionWriter.created).toHaveLength(1);
      expect(routingDecisionWriter.created[0]!.analysisId).toBe(job.id);
      expect(routingDecisionWriter.created[0]!.tenderId).toBe(job.tenderId);
      // Checkpoint E4.1 — plus de RoutingPolicy dans le chemin runtime : `routingPolicyId`/
      // `routingPolicyVersion` restent définitivement undefined, jamais une valeur fabriquée.
      expect(routingDecisionWriter.created[0]!.routingPolicyId).toBeUndefined();
      expect(routingDecisionWriter.created[0]!.routingPolicyVersion).toBeUndefined();
      expect(routingDecisionWriter.created[0]!.primaryModel).toBe("gpt-5.4-mini");

      expect(routingDecisionWriter.completed).toHaveLength(1);
      expect(routingDecisionWriter.completed[0]!.status).toBe("SUCCEEDED");
      expect(routingDecisionWriter.completed[0]!.selectedModel).toBe("gpt-5.4-mini");
      expect(routingDecisionWriter.completed[0]!.fallbackLevel).toBe(0);
      expect(routingDecisionWriter.completed[0]!.fallbackAttempts).toBe(0);
      // Même id pour create() et complete() — une seule décision par tentative, jamais deux lignes.
      expect(routingDecisionWriter.completed[0]!.id).toBe(routingDecisionWriter.created[0]!.id);
    });

    it("completes the routing decision as FAILED with the failure reason when every attempt fails", async () => {
      const job = await seedQueuedJob(jobRepository);
      const provider = new FakeAIProvider([{ kind: "error", error: new AiAuthenticationFailedError() }]);
      const routingDecisionWriter = new RecordingRoutingDecisionWriter();

      await buildUseCase(provider, BASE_CONFIG, new FakeAnalysisContentResolver(), routingDecisionWriter).execute({
        organizationId: ORG,
        jobId: job.id,
      });

      expect(routingDecisionWriter.created).toHaveLength(1);
      expect(routingDecisionWriter.completed).toHaveLength(1);
      expect(routingDecisionWriter.completed[0]!.status).toBe("FAILED");
      expect(routingDecisionWriter.completed[0]!.failureReason).toBe("AI_AUTHENTICATION_FAILED");
    });

    // Checkpoint E4.1 — l'escalade (Sprint 5.2) dépendait ENTIÈREMENT d'une `RoutingPolicy.
    // escalationModel`, elle-même retirée du chemin runtime : il n'existe plus de second modèle
    // vers lequel escalader. `fallbackLevel`/`fallbackAttempts` restent désormais TOUJOURS `0`
    // (voir le test précédent) — l'ancien test "tracks fallbackLevel=1..." est supprimé, il
    // exerçait un chemin de code qui n'existe plus.

    it("never fails the analysis when the routing decision writer itself throws on create() or complete()", async () => {
      const job = await seedQueuedJob(jobRepository);
      const provider = new FakeAIProvider([{ kind: "success" }]);

      await buildUseCase(
        provider,
        BASE_CONFIG,
        new FakeAnalysisContentResolver({ kind: "success" }),
        new ThrowingRoutingDecisionWriter(),
      ).execute({ organizationId: ORG, jobId: job.id });

      const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
      expect(stored!.status).toBe("SUCCEEDED");
    });

    it("never persists a routing decision at all when no writer is wired (legacy behavior unaffected)", async () => {
      const job = await seedQueuedJob(jobRepository);
      const provider = new FakeAIProvider([{ kind: "success" }]);

      await buildUseCase(provider, BASE_CONFIG, new FakeAnalysisContentResolver({ kind: "success" })).execute({
        organizationId: ORG,
        jobId: job.id,
      });

      const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
      expect(stored!.status).toBe("SUCCEEDED");
    });
  });
});
