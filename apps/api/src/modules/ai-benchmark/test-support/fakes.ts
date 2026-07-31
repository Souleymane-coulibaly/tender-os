import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";
import type { AIProvider, AIProviderRegistry, AIProviderRequest, AIProviderResult, PromptKey, PromptTemplatePort, RenderedPrompt } from "../../analysis";
import type { AiModelRepository, ListAiModelsFilter } from "../application/ports/ai-model.repository";
import type { AuditLogWriter, AiBenchmarkAuditLogEntry } from "../application/ports/audit-log-writer";
import type { BenchmarkCaseResultRepository } from "../application/ports/benchmark-case-result.repository";
import type { BenchmarkCaseRepository } from "../application/ports/benchmark-case.repository";
import type { BenchmarkRunDispatchInput, BenchmarkRunDispatcher } from "../application/ports/benchmark-run-dispatcher";
import type { BenchmarkRunRepository } from "../application/ports/benchmark-run.repository";
import type { BenchmarkSuiteRepository } from "../application/ports/benchmark-suite.repository";
import type { ModelRecommendationRepository } from "../application/ports/model-recommendation.repository";
import type { PricingSnapshotRepository } from "../application/ports/pricing-snapshot.repository";
import type { RoutingPolicyRepository } from "../application/ports/routing-policy.repository";
import { RoutingPolicyStatus } from "../domain/routing-policy-status";
import type { RoutingPolicy } from "../domain/routing-policy.aggregate";
import type { AiBenchmarkConfig } from "../infrastructure/ai-benchmark-config";
import type { AiModel } from "../domain/ai-model.aggregate";
import type { BenchmarkCaseResult } from "../domain/benchmark-case-result.entity";
import type { BenchmarkCase } from "../domain/benchmark-case.entity";
import type { BenchmarkRunModel } from "../domain/benchmark-run-model.entity";
import type { BenchmarkRun } from "../domain/benchmark-run.aggregate";
import type { BenchmarkSuite } from "../domain/benchmark-suite.aggregate";
import type { ModelRecommendation } from "../domain/model-recommendation.aggregate";
import type { AiModelPricingSnapshot } from "../domain/pricing-snapshot.entity";
import { DuplicateAiModelError } from "../domain/errors";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const FIXED_NOW = new Date("2026-07-30T10:00:00Z");

export class FixedClock implements Clock {
  constructor(private value: Date = FIXED_NOW) {}
  now(): Date {
    return this.value;
  }
  advance(ms: number): void {
    this.value = new Date(this.value.getTime() + ms);
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;
  generate(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

export class InMemoryAuditLogWriter implements AuditLogWriter {
  readonly entries: AiBenchmarkAuditLogEntry[] = [];
  async record(entry: AiBenchmarkAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

export class InMemoryAiModelRepository implements AiModelRepository {
  private readonly byId = new Map<string, AiModel>();

  async findById(input: { id: string }): Promise<AiModel | null> {
    return this.byId.get(input.id) ?? null;
  }

  async findByProviderAndModelKey(input: { provider: string; modelKey: string }): Promise<AiModel | null> {
    for (const model of this.byId.values()) {
      if (model.provider === input.provider && model.modelKey === input.modelKey) return model;
    }
    return null;
  }

  async list(filter?: ListAiModelsFilter): Promise<readonly AiModel[]> {
    return [...this.byId.values()].filter((model) => {
      if (filter?.enabledForBenchmark !== undefined && model.enabledForBenchmark !== filter.enabledForBenchmark) {
        return false;
      }
      if (filter?.enabledForProduction !== undefined && model.enabledForProduction !== filter.enabledForProduction) {
        return false;
      }
      return true;
    });
  }

  async create(model: AiModel): Promise<void> {
    const existing = await this.findByProviderAndModelKey({ provider: model.provider, modelKey: model.modelKey });
    if (existing) throw new DuplicateAiModelError();
    this.byId.set(model.id, model);
  }

  async save(model: AiModel): Promise<void> {
    this.byId.set(model.id, model);
  }
}

export class InMemoryPricingSnapshotRepository implements PricingSnapshotRepository {
  private readonly byId = new Map<string, AiModelPricingSnapshot>();

  async findById(input: { id: string }): Promise<AiModelPricingSnapshot | null> {
    return this.byId.get(input.id) ?? null;
  }

  async findCurrent(input: { aiModelId: string }): Promise<AiModelPricingSnapshot | null> {
    for (const snapshot of this.byId.values()) {
      if (snapshot.aiModelId === input.aiModelId && snapshot.isCurrent) return snapshot;
    }
    return null;
  }

  async listByModel(input: { aiModelId: string }): Promise<readonly AiModelPricingSnapshot[]> {
    return [...this.byId.values()]
      .filter((snapshot) => snapshot.aiModelId === input.aiModelId)
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  }

  async addSnapshot(snapshot: AiModelPricingSnapshot): Promise<void> {
    const current = await this.findCurrent({ aiModelId: snapshot.aiModelId });
    if (current) {
      current.close(snapshot.effectiveFrom);
    }
    this.byId.set(snapshot.id, snapshot);
  }
}

export class InMemoryBenchmarkSuiteRepository implements BenchmarkSuiteRepository {
  private readonly byId = new Map<string, BenchmarkSuite>();

  async findById(input: { id: string }): Promise<BenchmarkSuite | null> {
    return this.byId.get(input.id) ?? null;
  }

  async findLatestVersionByName(input: { name: string }): Promise<BenchmarkSuite | null> {
    const matches = [...this.byId.values()].filter((suite) => suite.name === input.name);
    matches.sort((a, b) => b.version - a.version);
    return matches[0] ?? null;
  }

  async list(): Promise<readonly BenchmarkSuite[]> {
    return [...this.byId.values()];
  }

  async create(suite: BenchmarkSuite): Promise<void> {
    this.byId.set(suite.id, suite);
  }

  async save(suite: BenchmarkSuite): Promise<void> {
    this.byId.set(suite.id, suite);
  }
}

export class InMemoryBenchmarkCaseRepository implements BenchmarkCaseRepository {
  private readonly byId = new Map<string, BenchmarkCase>();

  async findById(input: { id: string }): Promise<BenchmarkCase | null> {
    return this.byId.get(input.id) ?? null;
  }

  async listBySuite(input: { suiteId: string }): Promise<readonly BenchmarkCase[]> {
    return [...this.byId.values()].filter((benchmarkCase) => benchmarkCase.suiteId === input.suiteId);
  }

  async countBySuite(input: { suiteId: string }): Promise<number> {
    return (await this.listBySuite(input)).length;
  }

  async create(benchmarkCase: BenchmarkCase): Promise<void> {
    this.byId.set(benchmarkCase.id, benchmarkCase);
  }
}

export class InMemoryBenchmarkRunRepository implements BenchmarkRunRepository {
  private readonly byId = new Map<string, BenchmarkRun>();
  private readonly modelsByRunId = new Map<string, BenchmarkRunModel[]>();

  async findById(input: { organizationId: string; runId: string }): Promise<BenchmarkRun | null> {
    const run = this.byId.get(input.runId);
    return run && run.organizationId === input.organizationId ? run : null;
  }

  async list(input: { organizationId: string }): Promise<readonly BenchmarkRun[]> {
    return [...this.byId.values()].filter((run) => run.organizationId === input.organizationId);
  }

  async listStaleRunning(input: { updatedBefore: Date }): Promise<readonly BenchmarkRun[]> {
    return [...this.byId.values()].filter((run) => run.status === "RUNNING" && run.updatedAt < input.updatedBefore);
  }

  async createWithModels(run: BenchmarkRun, runModels: readonly BenchmarkRunModel[]): Promise<void> {
    this.byId.set(run.id, run);
    this.modelsByRunId.set(run.id, [...runModels]);
  }

  async save(run: BenchmarkRun): Promise<void> {
    this.byId.set(run.id, run);
  }

  async listRunModels(input: { runId: string }): Promise<readonly BenchmarkRunModel[]> {
    return this.modelsByRunId.get(input.runId) ?? [];
  }
}

export class InMemoryBenchmarkCaseResultRepository implements BenchmarkCaseResultRepository {
  readonly items: BenchmarkCaseResult[] = [];

  async create(result: BenchmarkCaseResult): Promise<void> {
    this.items.push(result);
  }

  async listByRun(input: { runId: string }): Promise<readonly BenchmarkCaseResult[]> {
    return this.items.filter((result) => result.runId === input.runId);
  }
}

export class RecordingBenchmarkRunDispatcher implements BenchmarkRunDispatcher {
  readonly dispatched: BenchmarkRunDispatchInput[] = [];
  private readonly onDispatch: ((input: BenchmarkRunDispatchInput) => void) | undefined;

  constructor(onDispatch?: (input: BenchmarkRunDispatchInput) => void) {
    this.onDispatch = onDispatch;
  }

  dispatch(input: BenchmarkRunDispatchInput): void {
    this.dispatched.push(input);
    this.onDispatch?.(input);
  }
}

export class InMemoryModelRecommendationRepository implements ModelRecommendationRepository {
  private readonly byId = new Map<string, ModelRecommendation>();

  async findById(input: { organizationId: string; recommendationId: string }): Promise<ModelRecommendation | null> {
    const recommendation = this.byId.get(input.recommendationId);
    return recommendation && recommendation.organizationId === input.organizationId ? recommendation : null;
  }

  async list(input: { organizationId: string }): Promise<readonly ModelRecommendation[]> {
    return [...this.byId.values()].filter((r) => r.organizationId === input.organizationId);
  }

  async create(recommendation: ModelRecommendation): Promise<void> {
    this.byId.set(recommendation.id, recommendation);
  }

  async save(recommendation: ModelRecommendation): Promise<void> {
    this.byId.set(recommendation.id, recommendation);
  }
}

/** Reproduit l'invariante "au plus une version ACTIVE par (org, promptKey)" de
 *  `PrismaRoutingPolicyRepository.activateAtomically` — même motif que
 *  `InMemoryTenderLotRepository` pour la contrainte d'unicité (tenderId, lotNumber). */
export class InMemoryRoutingPolicyRepository implements RoutingPolicyRepository {
  private readonly byId = new Map<string, RoutingPolicy>();

  async findById(input: { organizationId: string; policyId: string }): Promise<RoutingPolicy | null> {
    const policy = this.byId.get(input.policyId);
    return policy && policy.organizationId === input.organizationId ? policy : null;
  }

  async findActive(input: { organizationId: string; promptKey: string }): Promise<RoutingPolicy | null> {
    for (const policy of this.byId.values()) {
      if (policy.organizationId === input.organizationId && policy.promptKey === input.promptKey && policy.status === RoutingPolicyStatus.Active) {
        return policy;
      }
    }
    return null;
  }

  async findLatestVersion(input: { organizationId: string; promptKey: string }): Promise<RoutingPolicy | null> {
    const matches = [...this.byId.values()].filter(
      (policy) => policy.organizationId === input.organizationId && policy.promptKey === input.promptKey,
    );
    matches.sort((a, b) => b.version - a.version);
    return matches[0] ?? null;
  }

  async list(input: { organizationId: string }): Promise<readonly RoutingPolicy[]> {
    return [...this.byId.values()].filter((policy) => policy.organizationId === input.organizationId);
  }

  async create(policy: RoutingPolicy): Promise<void> {
    this.byId.set(policy.id, policy);
  }

  async save(policy: RoutingPolicy): Promise<void> {
    this.byId.set(policy.id, policy);
  }

  async activateAtomically(policy: RoutingPolicy): Promise<void> {
    const currentActive = await this.findActive({ organizationId: policy.organizationId, promptKey: policy.promptKey });
    if (currentActive && currentActive.id !== policy.id) {
      currentActive.archive(policy.effectiveFrom ?? new Date());
      this.byId.set(currentActive.id, currentActive);
    }
    this.byId.set(policy.id, policy);
  }
}

export type FakeAIProviderBehavior =
  | { kind: "success"; content?: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }; durationMs?: number; delayMs?: number }
  | { kind: "error"; error: Error; delayMs?: number };

/** Même motif que `analysis/test-support/fakes.ts` — jamais un appel réseau réel dans les tests
 *  (mission §"aucun appel réel payant n'est requis en CI"). Copie volontairement locale au module
 *  ai-benchmark (chaque module possède son propre test-support), même si le comportement simulé
 *  est identique. */
export class FakeAIProvider implements AIProvider {
  readonly name = "FAKE";
  readonly calls: AIProviderRequest[] = [];
  private readonly queue: FakeAIProviderBehavior[];

  constructor(behaviors: FakeAIProviderBehavior[] = [{ kind: "success" }]) {
    this.queue = [...behaviors];
  }

  async complete(request: AIProviderRequest): Promise<AIProviderResult> {
    this.calls.push(request);
    const behavior = this.queue.length > 1 ? this.queue.shift()! : this.queue[0]!;
    if (behavior.delayMs) {
      await sleep(behavior.delayMs);
    }
    if (behavior.kind === "error") {
      throw behavior.error;
    }
    return {
      content: behavior.content ?? "{}",
      usage: {
        inputTokens: behavior.usage?.inputTokens ?? 10,
        outputTokens: behavior.usage?.outputTokens ?? 5,
        totalTokens: behavior.usage?.totalTokens ?? 15,
      },
      durationMs: behavior.durationMs ?? 1,
      providerRequestId: "fake-request-id",
    };
  }
}

export class FakeAIProviderRegistry implements AIProviderRegistry {
  constructor(private readonly provider: AIProvider | (() => AIProvider)) {}

  resolve(): AIProvider {
    return typeof this.provider === "function" ? this.provider() : this.provider;
  }
}

/** Rend un prompt trivial — les cas de benchmark synthétiques n'ont pas besoin du template réel de
 *  production pour être évalués déterministement (seule `AIProvider.complete` est simulée). */
export class FakePromptTemplatePort implements PromptTemplatePort {
  render(key: PromptKey): RenderedPrompt {
    return { version: 1, systemPrompt: `system:${key}`, userPrompt: `user:${key}` };
  }
}

export const TEST_AI_BENCHMARK_CONFIG: AiBenchmarkConfig = {
  defaultCostCeilingAmount: "50",
  costCeilingCurrency: "USD",
  maxModelsPerRun: 10,
  maxConcurrency: 5,
  estimatedInputTokensPerCase: 1000,
  estimatedOutputTokensPerCase: 500,
  caseTimeoutMs: 30000,
  maxRawOutputLength: 5000,
  staleRunTimeoutMs: 15 * 60 * 1000,
  maxStaleRecoveryAttempts: 3,
};
