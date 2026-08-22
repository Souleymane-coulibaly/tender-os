import { describe, expect, it } from "vitest";
import { AiRateLimitedError, AiTimeoutError } from "../../../analysis";
import { AiModelRouter } from "../../../ai-routing";
import { InMemoryAiModelPreferenceRepository } from "../../../ai-routing/test-support/fakes";
import { ProcessGenerationUseCase } from "./process-generation.use-case";
import { GenerationOutputMode } from "../../domain/generation-output-mode";
import { GenerationStatus } from "../../domain/generation-status";
import { Generation } from "../../domain/generation.aggregate";
import { GenerationTaskType } from "../../domain/generation-task-type";
import { PromptTemplate } from "../../domain/prompt-template.aggregate";
import { PromptVersion } from "../../domain/prompt-version.entity";
import { loadGenerationConfig } from "../../infrastructure/generation-config";
import { GenerationContextBuilder } from "../services/generation-context-builder";
import {
  FakeAIProvider,
  FakeAIProviderRegistry,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryGenerationRepository,
  InMemoryPromptTemplateRepository,
  InMemoryPromptVersionRepository,
  InMemoryRoutingDecisionWriter,
  SequentialIdGenerator,
  ThrowingRoutingDecisionWriter,
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

// Checkpoint TENDEROS-2.1-P2.3-E4.1 — un `AiModelRouter` réel (jamais `undefined`) est câblé par
// défaut, comme en production : les tests qui ne testent pas spécifiquement le routing exercent
// donc le vrai chemin AUTOMATIC. Passer explicitement `null` simule l'absence de Router (cas
// défensif `@Optional()`, jamais le cas réel en production).
function buildHarness(options: {
  behaviors: ConstructorParameters<typeof FakeAIProvider>[0];
  routingDecisionWriter?: InMemoryRoutingDecisionWriter | ThrowingRoutingDecisionWriter;
  aiModelRouter?: AiModelRouter | null;
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
  const aiModelRouter = options.aiModelRouter === undefined ? new AiModelRouter(new InMemoryAiModelPreferenceRepository()) : options.aiModelRouter;

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
    routingDecisionWriter,
    aiModelRouter ?? undefined,
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

/** Checkpoint TENDEROS-2.1-P2.3-E4 — variante paramétrée par TaskType (jamais EXECUTIVE_SUMMARY en
 *  dur) et par acteur (`createdBy`), nécessaire pour exercer `AiModelRouter` (défaut par tâche +
 *  override utilisateur). */
async function seedFreeTextGenerationForTask(h: ReturnType<typeof buildHarness>, taskType: GenerationTaskType, createdBy = "user-1") {
  const template = PromptTemplate.create({
    id: `template-${taskType}`,
    organizationId: ORG,
    taskType,
    name: "Template",
    outputMode: GenerationOutputMode.FreeText,
    createdBy: "user-1",
    occurredAt: NOW,
  });
  await h.promptTemplateRepository.create(template);

  const version = PromptVersion.create({
    id: `version-${taskType}`,
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
    id: `gen-${taskType}`,
    organizationId: ORG,
    clientAccountId: "client-1",
    tenderId: "tender-1",
    taskType,
    rootGenerationId: `gen-${taskType}`,
    version: 1,
    promptTemplateId: template.id,
    promptVersionId: version.id,
    promptVersionNumber: version.version,
    createdBy,
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
      primaryProvider: "OPENAI",
      primaryModel: "gpt-5.4-mini",
    });
    // Checkpoint E4.1 — plus de RoutingPolicy dans le chemin runtime : `routingPolicyId`/
    // `routingPolicyVersion` restent définitivement undefined, jamais une valeur fabriquée.
    expect(writer.created[0]!.routingPolicyId).toBeUndefined();
    expect(writer.created[0]!.routingPolicyVersion).toBeUndefined();
    expect(writer.completed).toHaveLength(1);
    expect(writer.completed[0]).toMatchObject({ id: writer.created[0]!.id, status: "SUCCEEDED", fallbackLevel: 0 });

    const stored = await h.generationRepository.findById({ organizationId: ORG, generationId: generation.id });
    expect(stored?.routingPolicyId).toBeUndefined();
    expect(stored?.routingPolicyVersion).toBeUndefined();
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

  it("BLOQUANT — no AiModelRouter wired (defensive @Optional() case, never true in production): fails EXPLICITLY, never calls the provider, never creates a RoutingDecision (no silent fallback to a hardcoded model)", async () => {
    const writer = new InMemoryRoutingDecisionWriter();
    const h = buildHarness({ behaviors: [], aiModelRouter: null, routingDecisionWriter: writer });
    const { generation } = await seedFreeTextGeneration(h);

    await h.useCase.execute({ organizationId: ORG, generationId: generation.id });

    const stored = await h.generationRepository.findById({ organizationId: ORG, generationId: generation.id });
    expect(stored?.status).toBe(GenerationStatus.Failed);
    expect(stored?.errorCode).toBe("AI_MODEL_ROUTER_UNAVAILABLE");
    expect(stored?.routingDecisionId).toBeUndefined();
    expect(h.aiProvider.requests).toHaveLength(0);
    expect(writer.created).toHaveLength(0);
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

  // Checkpoint E4.1 — l'escalade (Sprint 5.2) dépendait ENTIÈREMENT d'une `RoutingPolicy.
  // escalationModel`, elle-même retirée du chemin runtime : il n'existe plus de second modèle vers
  // lequel escalader. L'ancien test "escalates exactly once..." est supprimé, il exerçait un
  // chemin de code qui n'existe plus.

  it("BLOQUANT — never a second model attempt after retries are exhausted, fallbackLevel stays 0 (no escalation mechanism exists anymore)", async () => {
    const h = buildHarness({
      behaviors: [{ kind: "error", error: new AiRateLimitedError() }, { kind: "error", error: new AiRateLimitedError() }],
    });
    const { generation } = await seedFreeTextGeneration(h);

    await h.useCase.execute({ organizationId: ORG, generationId: generation.id });

    const stored = await h.generationRepository.findById({ organizationId: ORG, generationId: generation.id });
    expect(stored?.status).toBe(GenerationStatus.Failed);
    expect(h.aiProvider.requests).toHaveLength(2); // 1 attempt + 1 retry (aiMaxRetries: 1), never a third/escalated call
  });

  it("is a no-op if the generation is not startable (e.g. already GENERATING)", async () => {
    const h = buildHarness({ behaviors: [] });
    const { generation } = await seedFreeTextGeneration(h);
    generation.reserve();
    await h.generationRepository.save(generation);

    await expect(h.useCase.execute({ organizationId: ORG, generationId: generation.id })).resolves.toBeUndefined();
    expect(h.aiProvider.requests).toHaveLength(0);
  });

  describe("Checkpoint TENDEROS-2.1-P2.3-E4.1 — AiModelRouter est la SEULE autorité de sélection du modèle", () => {
    it("mission §33 TEST_DEFAULT_NANO — SECTION_SUMMARY (real Generation task type) resolves to gpt-5.4-nano via AUTOMATIC, no configuration required", async () => {
      const aiModelRouter = new AiModelRouter(new InMemoryAiModelPreferenceRepository());
      const h = buildHarness({ behaviors: [{ kind: "success", result: fakeAIProviderResult() }], aiModelRouter });
      const { generation } = await seedFreeTextGenerationForTask(h, GenerationTaskType.SectionSummary);

      await h.useCase.execute({ organizationId: ORG, generationId: generation.id });

      const stored = await h.generationRepository.findById({ organizationId: ORG, generationId: generation.id });
      expect(stored?.status).toBe(GenerationStatus.Generated);
      expect(h.aiProvider.requests[0]?.model).toBe("gpt-5.4-nano");
      expect(stored?.routingPolicyId).toBeUndefined();
    });

    it("mission §34 TEST_DEFAULT_MINI — EXECUTIVE_SUMMARY (real Generation task type) resolves to gpt-5.4-mini via AUTOMATIC", async () => {
      const aiModelRouter = new AiModelRouter(new InMemoryAiModelPreferenceRepository());
      const h = buildHarness({ behaviors: [{ kind: "success", result: fakeAIProviderResult() }], aiModelRouter });
      const { generation } = await seedFreeTextGenerationForTask(h, GenerationTaskType.ExecutiveSummary);

      await h.useCase.execute({ organizationId: ORG, generationId: generation.id });

      expect(h.aiProvider.requests[0]?.model).toBe("gpt-5.4-mini");
    });

    it("mission §35 TEST_USER_OVERRIDE — a compatible user override (createdBy) is honored, then a reset returns to the task default", async () => {
      const preferenceRepository = new InMemoryAiModelPreferenceRepository();
      const aiModelRouter = new AiModelRouter(preferenceRepository);
      await preferenceRepository.set({ id: "pref-1", userId: "user-override", organizationId: ORG, taskType: "SECTION_SUMMARY", modelOverride: "GPT_5_4_MINI", occurredAt: NOW });

      const h1 = buildHarness({ behaviors: [{ kind: "success", result: fakeAIProviderResult() }], aiModelRouter });
      const { generation: gen1 } = await seedFreeTextGenerationForTask(h1, GenerationTaskType.SectionSummary, "user-override");
      await h1.useCase.execute({ organizationId: ORG, generationId: gen1.id });
      expect(h1.aiProvider.requests[0]?.model).toBe("gpt-5.4-mini");

      await preferenceRepository.reset({ userId: "user-override", organizationId: ORG, taskType: "SECTION_SUMMARY" });
      const h2 = buildHarness({ behaviors: [{ kind: "success", result: fakeAIProviderResult() }], aiModelRouter });
      const { generation: gen2 } = await seedFreeTextGenerationForTask(h2, GenerationTaskType.SectionSummary, "user-override");
      await h2.useCase.execute({ organizationId: ORG, generationId: gen2.id });
      expect(h2.aiProvider.requests[0]?.model).toBe("gpt-5.4-nano");
    });
  });
});
