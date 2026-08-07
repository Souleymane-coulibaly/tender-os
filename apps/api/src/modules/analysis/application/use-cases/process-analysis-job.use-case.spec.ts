import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { AnalysisJob } from "../../domain/analysis-job.aggregate";
import { AnalysisScope } from "../../domain/analysis-scope";
import {
  AiAuthenticationFailedError,
  AiProviderNotConfiguredError,
  AiRateLimitedError,
  AiSchemaValidationFailedError,
  AiTimeoutError,
} from "../../domain/errors";
import type { AnalysisConfig } from "../../infrastructure/analysis-config";
import {
  FakeAIProvider,
  FakeAIProviderRegistry,
  FakeAnalysisContentResolver,
  FakeOutboxWriter,
  FakeRoutingPolicyResolver,
  FixedClock,
  InMemoryAnalysisAttemptRepository,
  InMemoryAnalysisJobRepository,
  InMemoryAuditLogWriter,
  RecordingRoutingDecisionWriter,
  SequentialIdGenerator,
  ThrowingRoutingDecisionWriter,
  ThrowingRoutingPolicyResolver,
} from "../../test-support/fakes";
import { EscalationCondition } from "../../domain/escalation-condition";
import { ProcessAnalysisJobUseCase } from "./process-analysis-job.use-case";
import type { RoutingPolicyResolver } from "../ports/routing-policy-resolver";
import type { RoutingDecisionWriter } from "../ports/routing-decision-writer";

const ORG = randomUUID();
const NOW = new Date("2026-07-29T14:00:00Z");

const BASE_CONFIG: AnalysisConfig = {
  aiModel: "fake-model",
  aiModelForDocumentAnalysis: "fake-model",
  aiModelForTenderConsolidation: "fake-model",
  aiTimeoutMs: 2000,
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

  function buildUseCase(
    provider: FakeAIProvider,
    config: AnalysisConfig = BASE_CONFIG,
    contentResolver: FakeAnalysisContentResolver = new FakeAnalysisContentResolver(),
    routingPolicyResolver?: RoutingPolicyResolver,
    routingDecisionWriter?: RoutingDecisionWriter,
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
      routingPolicyResolver,
      routingDecisionWriter,
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

  describe("Sprint 5.2 — routing policy resolution and fallback escalation", () => {
    it("(a) no RoutingPolicyResolver injected — behaves exactly like Sprint 4.1/4.2 (regression guard)", async () => {
      const job = await seedQueuedJob(jobRepository);
      const provider = new FakeAIProvider([{ kind: "success" }]);

      await buildUseCase(provider, BASE_CONFIG, new FakeAnalysisContentResolver({ kind: "success" })).execute({
        organizationId: ORG,
        jobId: job.id,
      });

      const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
      expect(stored!.status).toBe("SUCCEEDED");
      expect(stored!.model).toBe(BASE_CONFIG.aiModelForTenderConsolidation);
    });

    it("(a bis) a resolver that returns null (no active policy) also falls back to the legacy static model", async () => {
      const job = await seedQueuedJob(jobRepository);
      const provider = new FakeAIProvider([{ kind: "success" }]);

      await buildUseCase(
        provider,
        BASE_CONFIG,
        new FakeAnalysisContentResolver({ kind: "success" }),
        new FakeRoutingPolicyResolver(null),
      ).execute({ organizationId: ORG, jobId: job.id });

      const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
      expect(stored!.model).toBe(BASE_CONFIG.aiModelForTenderConsolidation);
    });

    it("(a ter) a resolver that throws is treated as 'no policy' — never crashes the job", async () => {
      const job = await seedQueuedJob(jobRepository);
      const provider = new FakeAIProvider([{ kind: "success" }]);

      await buildUseCase(
        provider,
        BASE_CONFIG,
        new FakeAnalysisContentResolver({ kind: "success" }),
        new ThrowingRoutingPolicyResolver(),
      ).execute({ organizationId: ORG, jobId: job.id });

      const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
      expect(stored!.status).toBe("SUCCEEDED");
      expect(stored!.model).toBe(BASE_CONFIG.aiModelForTenderConsolidation);
    });

    it("(b) a resolver decision routes the job to the configured primary model and provider", async () => {
      const job = await seedQueuedJob(jobRepository);
      const provider = new FakeAIProvider([{ kind: "success" }]);
      const resolver = new FakeRoutingPolicyResolver({
        policyId: "policy-1",
        policyVersion: 3,
        primaryModel: { provider: "OPENAI", modelKey: "gpt-4o" },
        provenanceRequired: true,
        escalationConditions: [],
        timeoutMs: 30000,
        maxRetries: 1,
      });

      await buildUseCase(provider, BASE_CONFIG, new FakeAnalysisContentResolver({ kind: "success" }), resolver).execute({
        organizationId: ORG,
        jobId: job.id,
      });

      const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
      expect(stored!.status).toBe("SUCCEEDED");
      expect(stored!.model).toBe("gpt-4o");
    });

    it("(c) primary attempt fails on a configured escalation condition, an escalation model is configured — exactly one fallback attempt runs and its success becomes the job's final result", async () => {
      const job = await seedQueuedJob(jobRepository);
      // File d'attente : le PREMIER appel (modèle principal) échoue avec un timeout ; le SECOND
      // appel (modèle d'escalade) réussit — un seul appel provider par tentative ici puisque
      // aiMaxRetries=0 dans la config ci-dessous (jamais de retry interne masquant l'ordre attendu).
      const provider = new FakeAIProvider([
        { kind: "error", error: new AiTimeoutError({ timeoutMs: 1000 }) },
        { kind: "success" },
      ]);
      const noInternalRetryConfig: AnalysisConfig = { ...BASE_CONFIG, aiMaxRetries: 0 };
      const resolver = new FakeRoutingPolicyResolver({
        policyId: "policy-1",
        policyVersion: 1,
        primaryModel: { provider: "OPENAI", modelKey: "gpt-4o-mini" },
        escalationModel: { provider: "OPENAI", modelKey: "gpt-4o" },
        provenanceRequired: true,
        escalationConditions: [EscalationCondition.Timeout],
        timeoutMs: 1000,
        maxRetries: 0,
      });

      await buildUseCase(
        provider,
        noInternalRetryConfig,
        new FakeAnalysisContentResolver({ kind: "success" }),
        resolver,
      ).execute({ organizationId: ORG, jobId: job.id });

      const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
      expect(stored!.status).toBe("SUCCEEDED");
      expect(stored!.model).toBe("gpt-4o"); // le modèle d'escalade, jamais le principal
      const attempts = await attemptRepository.listByJobId({ organizationId: ORG, jobId: job.id });
      expect(attempts).toHaveLength(1); // une seule ligne d'historique (mission §"simple") — reflète le résultat final retenu
    });

    it("(d) primary fails on a condition NOT configured for escalation — no fallback attempt, job ends FAILED", async () => {
      const job = await seedQueuedJob(jobRepository);
      const provider = new FakeAIProvider([{ kind: "error", error: new AiAuthenticationFailedError() }]);
      const resolver = new FakeRoutingPolicyResolver({
        policyId: "policy-1",
        policyVersion: 1,
        primaryModel: { provider: "OPENAI", modelKey: "gpt-4o-mini" },
        escalationModel: { provider: "OPENAI", modelKey: "gpt-4o" },
        provenanceRequired: true,
        // Timeout uniquement — pas ProviderError : une panne d'authentification ne doit PAS
        // déclencher d'escalade ici (mission §"ne vérifie que les conditions configurées").
        escalationConditions: [EscalationCondition.Timeout],
        timeoutMs: 30000,
        maxRetries: 1,
      });

      await buildUseCase(provider, BASE_CONFIG, new FakeAnalysisContentResolver({ kind: "success" }), resolver).execute({
        organizationId: ORG,
        jobId: job.id,
      });

      const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
      expect(stored!.status).toBe("FAILED");
      expect(stored!.model).toBe("gpt-4o-mini");
    });

    it("(e) both the primary AND the escalation attempt fail — job ends FAILED, never throws, never loops beyond one fallback", async () => {
      const job = await seedQueuedJob(jobRepository);
      const provider = new FakeAIProvider([
        { kind: "error", error: new AiTimeoutError({ timeoutMs: 1000 }) },
        { kind: "error", error: new AiTimeoutError({ timeoutMs: 1000 }) },
      ]);
      const noInternalRetryConfig: AnalysisConfig = { ...BASE_CONFIG, aiMaxRetries: 0 };
      const resolver = new FakeRoutingPolicyResolver({
        policyId: "policy-1",
        policyVersion: 1,
        primaryModel: { provider: "OPENAI", modelKey: "gpt-4o-mini" },
        escalationModel: { provider: "OPENAI", modelKey: "gpt-4o" },
        provenanceRequired: true,
        escalationConditions: [EscalationCondition.Timeout],
        timeoutMs: 1000,
        maxRetries: 0,
      });

      await buildUseCase(
        provider,
        noInternalRetryConfig,
        new FakeAnalysisContentResolver({ kind: "success" }),
        resolver,
      ).execute({ organizationId: ORG, jobId: job.id });

      const stored = await jobRepository.findById({ organizationId: ORG, jobId: job.id });
      expect(stored!.status).toBe("FAILED");
      expect(stored!.model).toBe("gpt-4o"); // la tentative d'escalade est la dernière tenue, son échec est le résultat final
      const attempts = await attemptRepository.listByJobId({ organizationId: ORG, jobId: job.id });
      expect(attempts).toHaveLength(1);
    });
  });

  describe("Audit Codex P1-4 — persistance durable de la décision de routage", () => {
    it("creates a routing decision before the provider call, and completes it exactly once on success", async () => {
      const job = await seedQueuedJob(jobRepository);
      const provider = new FakeAIProvider([
        { kind: "success", usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 } },
      ]);
      const resolver = new FakeRoutingPolicyResolver({
        policyId: "policy-1",
        policyVersion: 1,
        primaryModel: { provider: "OPENAI", modelKey: "gpt-4o" },
        provenanceRequired: true,
        escalationConditions: [],
        timeoutMs: 30000,
        maxRetries: 1,
      });
      const routingDecisionWriter = new RecordingRoutingDecisionWriter();

      await buildUseCase(provider, BASE_CONFIG, new FakeAnalysisContentResolver({ kind: "success" }), resolver, routingDecisionWriter).execute({
        organizationId: ORG,
        jobId: job.id,
      });

      expect(routingDecisionWriter.created).toHaveLength(1);
      expect(routingDecisionWriter.created[0]!.analysisId).toBe(job.id);
      expect(routingDecisionWriter.created[0]!.tenderId).toBe(job.tenderId);
      expect(routingDecisionWriter.created[0]!.routingPolicyId).toBe("policy-1");
      expect(routingDecisionWriter.created[0]!.routingPolicyVersion).toBe(1);
      expect(routingDecisionWriter.created[0]!.primaryModel).toBe("gpt-4o");

      expect(routingDecisionWriter.completed).toHaveLength(1);
      expect(routingDecisionWriter.completed[0]!.status).toBe("SUCCEEDED");
      expect(routingDecisionWriter.completed[0]!.selectedModel).toBe("gpt-4o");
      expect(routingDecisionWriter.completed[0]!.fallbackLevel).toBe(0);
      expect(routingDecisionWriter.completed[0]!.fallbackAttempts).toBe(0);
      // Même id pour create() et complete() — une seule décision par tentative, jamais deux lignes.
      expect(routingDecisionWriter.completed[0]!.id).toBe(routingDecisionWriter.created[0]!.id);
    });

    it("completes the routing decision as FAILED with the failure reason when every attempt fails", async () => {
      const job = await seedQueuedJob(jobRepository);
      const provider = new FakeAIProvider([{ kind: "error", error: new AiAuthenticationFailedError() }]);
      const routingDecisionWriter = new RecordingRoutingDecisionWriter();

      await buildUseCase(provider, BASE_CONFIG, new FakeAnalysisContentResolver(), undefined, routingDecisionWriter).execute({
        organizationId: ORG,
        jobId: job.id,
      });

      expect(routingDecisionWriter.created).toHaveLength(1);
      expect(routingDecisionWriter.completed).toHaveLength(1);
      expect(routingDecisionWriter.completed[0]!.status).toBe("FAILED");
      expect(routingDecisionWriter.completed[0]!.failureReason).toBe("AI_AUTHENTICATION_FAILED");
    });

    it("tracks fallbackLevel=1 and fallbackAttempts=1 when the escalation attempt provides the final result", async () => {
      const job = await seedQueuedJob(jobRepository);
      const provider = new FakeAIProvider([
        { kind: "error", error: new AiTimeoutError({ timeoutMs: 1000 }) },
        { kind: "success" },
      ]);
      const noInternalRetryConfig: AnalysisConfig = { ...BASE_CONFIG, aiMaxRetries: 0 };
      const resolver = new FakeRoutingPolicyResolver({
        policyId: "policy-1",
        policyVersion: 1,
        primaryModel: { provider: "OPENAI", modelKey: "gpt-4o-mini" },
        escalationModel: { provider: "OPENAI", modelKey: "gpt-4o" },
        provenanceRequired: true,
        escalationConditions: [EscalationCondition.Timeout],
        timeoutMs: 1000,
        maxRetries: 0,
      });
      const routingDecisionWriter = new RecordingRoutingDecisionWriter();

      await buildUseCase(provider, noInternalRetryConfig, new FakeAnalysisContentResolver({ kind: "success" }), resolver, routingDecisionWriter).execute(
        { organizationId: ORG, jobId: job.id },
      );

      expect(routingDecisionWriter.completed).toHaveLength(1);
      expect(routingDecisionWriter.completed[0]!.status).toBe("SUCCEEDED");
      expect(routingDecisionWriter.completed[0]!.selectedModel).toBe("gpt-4o");
      expect(routingDecisionWriter.completed[0]!.fallbackLevel).toBe(1);
      expect(routingDecisionWriter.completed[0]!.fallbackAttempts).toBe(1);
    });

    it("never fails the analysis when the routing decision writer itself throws on create() or complete()", async () => {
      const job = await seedQueuedJob(jobRepository);
      const provider = new FakeAIProvider([{ kind: "success" }]);

      await buildUseCase(
        provider,
        BASE_CONFIG,
        new FakeAnalysisContentResolver({ kind: "success" }),
        undefined,
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
