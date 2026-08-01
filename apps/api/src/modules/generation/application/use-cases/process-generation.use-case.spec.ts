import { describe, expect, it } from "vitest";
import { AiRateLimitedError, AiTimeoutError } from "../../../analysis";
import { ProcessGenerationUseCase } from "./process-generation.use-case";
import { GenerationOutputMode } from "../../domain/generation-output-mode";
import { GenerationStatus } from "../../domain/generation-status";
import { Generation } from "../../domain/generation.aggregate";
import { GenerationTaskType } from "../../domain/generation-task-type";
import { PromptTemplate } from "../../domain/prompt-template.aggregate";
import { PromptVersion } from "../../domain/prompt-version.entity";
import { loadGenerationConfig } from "../../infrastructure/generation-config";
import { GenerationContextBuilder } from "../services/generation-context-builder";
import type { ActiveRoutingDecision } from "../ports/routing-policy-resolver";
import {
  FakeAIProvider,
  FakeAIProviderRegistry,
  FakeRoutingPolicyResolver,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryGenerationRepository,
  InMemoryPromptTemplateRepository,
  InMemoryPromptVersionRepository,
  InMemoryRoutingDecisionWriter,
  SequentialIdGenerator,
  ThrowingRoutingDecisionWriter,
  ThrowingRoutingPolicyResolver,
  defaultActiveRoutingDecision,
  fakeAIProviderResult,
} from "../../test-support/fakes";
import { SimplePlaceholderPromptRenderer } from "../../infrastructure/simple-placeholder-prompt.renderer";

const ORG = "org-1";
const NOW = new Date("2026-08-01T10:00:00.000Z");

/** GenerationContextBuilder fait de vrais appels vers d'autres modules (Tenders/Analysis/
 *  KnowledgeBase) — hors périmètre pour un test d'orchestration en mémoire. Cette version minimale
 *  respecte la même interface publique sans dépendance externe. */
class FakeContextBuilder {
  variablesToReturn: Readonly<Record<string, string>> = { "tender.title": "Marché de fournitures" };
  knownKnowledgeReferences = new Map<string, { knowledgeEntryId: string; excerpt: string }>();
  async build() {
    return { clientAccountId: "client-1", variables: this.variablesToReturn, knownKnowledgeReferences: this.knownKnowledgeReferences };
  }
}

function buildHarness(options: {
  behaviors: ConstructorParameters<typeof FakeAIProvider>[0];
  /** Correctif Sprint 6 (audit Codex P1-1) — une décision active PAR DÉFAUT (le chemin normal),
   *  jamais `undefined`/`null` implicite : passer `null` explicitement pour tester l'absence de
   *  policy (son propre test dédié, voir plus bas). */
  routingDecision?: ActiveRoutingDecision | null;
  routingDecisionWriter?: InMemoryRoutingDecisionWriter | ThrowingRoutingDecisionWriter;
  routingPolicyResolver?: ThrowingRoutingPolicyResolver;
}) {
  const clock = new FixedClock(NOW);
  const generationRepository = new InMemoryGenerationRepository();
  const promptTemplateRepository = new InMemoryPromptTemplateRepository();
  const promptVersionRepository = new InMemoryPromptVersionRepository();
  const auditLogWriter = new InMemoryAuditLogWriter();
  const aiProvider = new FakeAIProvider(options.behaviors);
  const providerRegistry = new FakeAIProviderRegistry(aiProvider);
  const contextBuilder = new FakeContextBuilder();
  const renderer = new SimplePlaceholderPromptRenderer();
  const config = { ...loadGenerationConfig({}), aiMaxRetries: 1, aiRetryDelayMs: 0 };
  const idGenerator = new SequentialIdGenerator();
  const routingDecisionWriter = options.routingDecisionWriter ?? new InMemoryRoutingDecisionWriter();
  const decision = options.routingDecision === undefined ? defaultActiveRoutingDecision() : options.routingDecision;
  const routingPolicyResolver = options.routingPolicyResolver ?? new FakeRoutingPolicyResolver(decision);

  const useCase = new ProcessGenerationUseCase(
    generationRepository,
    providerRegistry,
    promptTemplateRepository,
    promptVersionRepository,
    renderer,
    contextBuilder as unknown as GenerationContextBuilder,
    auditLogWriter,
    config,
    clock,
    idGenerator,
    routingPolicyResolver,
    routingDecisionWriter,
  );

  return {
    useCase,
    generationRepository,
    promptTemplateRepository,
    promptVersionRepository,
    auditLogWriter,
    aiProvider,
    contextBuilder,
    clock,
    routingDecisionWriter,
  };
}

async function seedFreeTextGeneration(h: ReturnType<typeof buildHarness>) {
  const template = PromptTemplate.create({
    id: "template-1",
    organizationId: ORG,
    taskType: GenerationTaskType.ExecutiveSummary,
    name: "Synthèse",
    outputMode: GenerationOutputMode.FreeText,
    createdBy: "user-1",
    occurredAt: NOW,
  });
  await h.promptTemplateRepository.create(template);

  const version = PromptVersion.create({
    id: "version-1",
    organizationId: ORG,
    promptTemplateId: template.id,
    version: 1,
    systemPrompt: "You are helpful.",
    userPromptTemplate: "Summarize {{tender.title}}",
    requiredVariables: ["tender.title"],
    authorUserId: "user-1",
    occurredAt: NOW,
  });
  version.activate(NOW);
  await h.promptVersionRepository.create(version);

  const generation = Generation.create({
    id: "gen-1",
    organizationId: ORG,
    clientAccountId: "client-1",
    tenderId: "tender-1",
    taskType: GenerationTaskType.ExecutiveSummary,
    rootGenerationId: "gen-1",
    version: 1,
    promptTemplateId: template.id,
    promptVersionId: version.id,
    promptVersionNumber: version.version,
    createdBy: "user-1",
    createdByRole: "OWNER",
    occurredAt: NOW,
  });
  await h.generationRepository.create(generation);
  return { template, version, generation };
}

describe("ProcessGenerationUseCase", () => {
  it("happy path: reserves, calls the provider once, persists content/tokens/latency, ends GENERATED", async () => {
    const h = buildHarness({ behaviors: [{ kind: "success", result: fakeAIProviderResult({ content: "Le résumé exécutif." }) }] });
    const { generation } = await seedFreeTextGeneration(h);

    await h.useCase.execute({ organizationId: ORG, generationId: generation.id });

    const stored = await h.generationRepository.findById({ organizationId: ORG, generationId: generation.id });
    expect(stored?.status).toBe(GenerationStatus.Generated);
    expect(stored?.generatedContent).toBe("Le résumé exécutif.");
    expect(stored?.inputTokenCount).toBe(10);
    expect(stored?.fallbackLevel).toBe(0);
    expect(h.aiProvider.requests).toHaveLength(1);
  });

  it("correctif P1-1/P1-2 (audit Codex) — a real RoutingDecision is created BEFORE the provider call and completed AFTER, and the generation is linked to its real id (never a fabricated local UUID)", async () => {
    const h = buildHarness({ behaviors: [{ kind: "success", result: fakeAIProviderResult() }] });
    const { generation } = await seedFreeTextGeneration(h);

    await h.useCase.execute({ organizationId: ORG, generationId: generation.id });

    const writer = h.routingDecisionWriter as InMemoryRoutingDecisionWriter;
    expect(writer.created).toHaveLength(1);
    expect(writer.created[0]).toMatchObject({
      organizationId: ORG,
      generationId: generation.id,
      taskType: GenerationTaskType.ExecutiveSummary,
      routingPolicyId: "policy-1",
      routingPolicyVersion: 1,
      primaryProvider: "OPENAI",
      primaryModel: "gpt-4o-mini",
    });
    expect(writer.completed).toHaveLength(1);
    expect(writer.completed[0]).toMatchObject({ id: writer.created[0]!.id, status: "SUCCEEDED", fallbackLevel: 0 });

    const stored = await h.generationRepository.findById({ organizationId: ORG, generationId: generation.id });
    expect(stored?.routingPolicyId).toBe("policy-1");
    expect(stored?.routingPolicyVersion).toBe(1);
    expect(stored?.routingDecisionId).toBe(writer.created[0]!.id);
  });

  it("correctif P2-3 (audit Codex) — the real cost returned by the RoutingDecisionWriter overrides the static-config estimate", async () => {
    const writer = new InMemoryRoutingDecisionWriter();
    writer.costToReturn = { actualCostAmount: "0.004242", currency: "EUR" };
    const h = buildHarness({ behaviors: [{ kind: "success", result: fakeAIProviderResult() }], routingDecisionWriter: writer });
    const { generation } = await seedFreeTextGeneration(h);

    await h.useCase.execute({ organizationId: ORG, generationId: generation.id });

    const stored = await h.generationRepository.findById({ organizationId: ORG, generationId: generation.id });
    expect(stored?.estimatedCostAmount).toBe("0.004242");
    expect(stored?.currency).toBe("EUR");
  });

  it("correctif P1-1 (audit Codex) — no active routing policy: fails EXPLICITLY, never calls the provider, never creates a RoutingDecision (no silent fallback to a hardcoded model)", async () => {
    const writer = new InMemoryRoutingDecisionWriter();
    const h = buildHarness({ behaviors: [], routingDecision: null, routingDecisionWriter: writer });
    const { generation } = await seedFreeTextGeneration(h);

    await h.useCase.execute({ organizationId: ORG, generationId: generation.id });

    const stored = await h.generationRepository.findById({ organizationId: ORG, generationId: generation.id });
    expect(stored?.status).toBe(GenerationStatus.Failed);
    expect(stored?.errorCode).toBe("NO_ACTIVE_ROUTING_POLICY");
    expect(stored?.routingDecisionId).toBeUndefined();
    expect(h.aiProvider.requests).toHaveLength(0);
    expect(writer.created).toHaveLength(0);
  });

  it("a routing policy resolution error is treated identically to 'no active policy' — never an unhandled exception", async () => {
    const h = buildHarness({ behaviors: [], routingPolicyResolver: new ThrowingRoutingPolicyResolver() });
    const { generation } = await seedFreeTextGeneration(h);

    await expect(h.useCase.execute({ organizationId: ORG, generationId: generation.id })).resolves.toBeUndefined();

    const stored = await h.generationRepository.findById({ organizationId: ORG, generationId: generation.id });
    expect(stored?.status).toBe(GenerationStatus.Failed);
    expect(stored?.errorCode).toBe("NO_ACTIVE_ROUTING_POLICY");
    expect(h.aiProvider.requests).toHaveLength(0);
  });

  it("correctif P1-2 (audit Codex) — a policy resolves but the RoutingDecision cannot be persisted durably: fails explicitly, never an untraceable provider call", async () => {
    const h = buildHarness({ behaviors: [], routingDecisionWriter: new ThrowingRoutingDecisionWriter() });
    const { generation } = await seedFreeTextGeneration(h);

    await h.useCase.execute({ organizationId: ORG, generationId: generation.id });

    const stored = await h.generationRepository.findById({ organizationId: ORG, generationId: generation.id });
    expect(stored?.status).toBe(GenerationStatus.Failed);
    expect(stored?.errorCode).toBe("ROUTING_DECISION_PERSISTENCE_FAILED");
    expect(h.aiProvider.requests).toHaveLength(0);
  });

  it("retries a retryable error and succeeds on the second attempt, never creating a new version", async () => {
    const h = buildHarness({
      behaviors: [{ kind: "error", error: new AiTimeoutError({ timeoutMs: 1000 }) }, { kind: "success", result: fakeAIProviderResult() }],
    });
    const { generation } = await seedFreeTextGeneration(h);

    await h.useCase.execute({ organizationId: ORG, generationId: generation.id });

    const stored = await h.generationRepository.findById({ organizationId: ORG, generationId: generation.id });
    expect(stored?.status).toBe(GenerationStatus.Generated);
    expect(stored?.version).toBe(1);
    expect(h.aiProvider.requests).toHaveLength(2);
  });

  it("a non-retryable error (schema validation) fails immediately, never retried", async () => {
    const h = buildHarness({ behaviors: [{ kind: "success", result: fakeAIProviderResult({ content: "not json {" }) }] });
    const template = PromptTemplate.create({
      id: "template-1",
      organizationId: ORG,
      taskType: GenerationTaskType.CriterionResponse,
      name: "Réponse critère",
      outputMode: GenerationOutputMode.Structured,
      structuredSchemaKey: "CRITERION_RESPONSE",
      createdBy: "user-1",
      occurredAt: NOW,
    });
    await h.promptTemplateRepository.create(template);
    const version = PromptVersion.create({
      id: "version-1",
      organizationId: ORG,
      promptTemplateId: template.id,
      version: 1,
      systemPrompt: "S",
      userPromptTemplate: "U",
      requiredVariables: [],
      authorUserId: "user-1",
      occurredAt: NOW,
    });
    version.activate(NOW);
    await h.promptVersionRepository.create(version);
    const generation = Generation.create({
      id: "gen-1",
      organizationId: ORG,
      clientAccountId: "client-1",
      tenderId: "tender-1",
      taskType: GenerationTaskType.CriterionResponse,
      rootGenerationId: "gen-1",
      version: 1,
      promptTemplateId: template.id,
      promptVersionId: version.id,
      promptVersionNumber: version.version,
      createdBy: "user-1",
      occurredAt: NOW,
    });
    await h.generationRepository.create(generation);

    await h.useCase.execute({ organizationId: ORG, generationId: generation.id });

    const stored = await h.generationRepository.findById({ organizationId: ORG, generationId: generation.id });
    expect(stored?.status).toBe(GenerationStatus.Failed);
    expect(stored?.errorCode).toBe("GENERATION_SCHEMA_VALIDATION_FAILED");
    expect(h.aiProvider.requests).toHaveLength(1);
  });

  it("rejects a hallucinated citation (knowledgeEntryId not in the supplied context), never persists it as valid", async () => {
    const structuredContent = JSON.stringify({
      title: "T",
      content: "C",
      keyPoints: [],
      sources: [{ knowledgeEntryId: "kb-does-not-exist" }],
      warnings: [],
    });
    const h = buildHarness({ behaviors: [{ kind: "success", result: fakeAIProviderResult({ content: structuredContent }) }] });
    const template = PromptTemplate.create({
      id: "template-1",
      organizationId: ORG,
      taskType: GenerationTaskType.CriterionResponse,
      name: "Réponse critère",
      outputMode: GenerationOutputMode.Structured,
      structuredSchemaKey: "CRITERION_RESPONSE",
      createdBy: "user-1",
      occurredAt: NOW,
    });
    await h.promptTemplateRepository.create(template);
    const version = PromptVersion.create({
      id: "version-1",
      organizationId: ORG,
      promptTemplateId: template.id,
      version: 1,
      systemPrompt: "S",
      userPromptTemplate: "U",
      requiredVariables: [],
      authorUserId: "user-1",
      occurredAt: NOW,
    });
    version.activate(NOW);
    await h.promptVersionRepository.create(version);
    const generation = Generation.create({
      id: "gen-1",
      organizationId: ORG,
      clientAccountId: "client-1",
      tenderId: "tender-1",
      taskType: GenerationTaskType.CriterionResponse,
      rootGenerationId: "gen-1",
      version: 1,
      promptTemplateId: template.id,
      promptVersionId: version.id,
      promptVersionNumber: version.version,
      createdBy: "user-1",
      occurredAt: NOW,
    });
    await h.generationRepository.create(generation);
    // contextBuilder.knownKnowledgeReferences stays empty — "kb-does-not-exist" was never supplied.

    await h.useCase.execute({ organizationId: ORG, generationId: generation.id });

    const stored = await h.generationRepository.findById({ organizationId: ORG, generationId: generation.id });
    expect(stored?.status).toBe(GenerationStatus.Failed);
    expect(stored?.errorCode).toBe("GENERATION_CITATION_VALIDATION_FAILED");
  });

  it("escalates exactly once to the fallback model when the primary fails and a matching escalation condition is configured", async () => {
    const h = buildHarness({
      behaviors: [
        { kind: "error", error: new AiRateLimitedError() },
        { kind: "error", error: new AiRateLimitedError() },
        { kind: "success", result: fakeAIProviderResult({ content: "Escalated content" }) },
      ],
      routingDecision: defaultActiveRoutingDecision({
        escalationModel: { provider: "OPENAI", modelKey: "gpt-4o" },
        escalationConditions: ["PROVIDER_ERROR"],
      }),
    });
    const { generation } = await seedFreeTextGeneration(h);

    await h.useCase.execute({ organizationId: ORG, generationId: generation.id });

    const stored = await h.generationRepository.findById({ organizationId: ORG, generationId: generation.id });
    expect(stored?.status).toBe(GenerationStatus.Generated);
    expect(stored?.fallbackLevel).toBe(1);
    expect(stored?.modelKey).toBe("gpt-4o");
    expect(stored?.generatedContent).toBe("Escalated content");

    const writer = h.routingDecisionWriter as InMemoryRoutingDecisionWriter;
    expect(writer.completed[0]).toMatchObject({ fallbackLevel: 1, fallbackAttempts: 1, selectedModel: "gpt-4o", status: "SUCCEEDED" });
  });

  it("never escalates twice, and never escalates without a configured escalation model", async () => {
    const h = buildHarness({
      behaviors: [{ kind: "error", error: new AiRateLimitedError() }, { kind: "error", error: new AiRateLimitedError() }],
    });
    const { generation } = await seedFreeTextGeneration(h);

    await h.useCase.execute({ organizationId: ORG, generationId: generation.id });

    const stored = await h.generationRepository.findById({ organizationId: ORG, generationId: generation.id });
    expect(stored?.status).toBe(GenerationStatus.Failed);
    expect(h.aiProvider.requests).toHaveLength(2); // 1 attempt + 1 retry, no escalation call
  });

  it("is a no-op if the generation is not startable (e.g. already GENERATING)", async () => {
    const h = buildHarness({ behaviors: [] });
    const { generation } = await seedFreeTextGeneration(h);
    generation.reserve();
    await h.generationRepository.save(generation);

    await expect(h.useCase.execute({ organizationId: ORG, generationId: generation.id })).resolves.toBeUndefined();
    expect(h.aiProvider.requests).toHaveLength(0);
  });
});
