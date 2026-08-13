import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";
import type { AIProvider, AIProviderRegistry, AIProviderRequest, AIProviderResult } from "../../analysis";
import { AssertClientAccessUseCase } from "../../client-portfolio";
import { InMemoryClientAssignmentRepository } from "../../client-portfolio/test-support/fakes";
import type { AuditLogWriter, GenerationAuditLogEntry } from "../application/ports/audit-log-writer";
import type { GenerationDispatchInput, GenerationDispatcher } from "../application/ports/generation-dispatcher";
import type {
  FinalizeGenerationOutcome,
  GenerationListResult,
  GenerationRepository,
  GenerationReservationOutcome,
  ListGenerationsByTenderQuery,
} from "../application/ports/generation.repository";
import type { PromptTemplateRepository } from "../application/ports/prompt-template.repository";
import type { PromptVersionRepository } from "../application/ports/prompt-version.repository";
import type { ActiveRoutingDecision, RoutingPolicyResolver } from "../application/ports/routing-policy-resolver";
import type {
  CompleteRoutingDecisionInput,
  CompleteRoutingDecisionResult,
  CreateRoutingDecisionInput,
  RoutingDecisionWriter,
} from "../application/ports/routing-decision-writer";
import { GenerationStatus } from "../domain/generation-status";
import { Generation } from "../domain/generation.aggregate";
import type { GenerationTaskType } from "../domain/generation-task-type";
import { PromptVersionActivationConflictError } from "../domain/errors";
import { PromptVersionStatus } from "../domain/prompt-version-status";
import { PromptVersion } from "../domain/prompt-version.entity";
import type { PromptTemplate } from "../domain/prompt-template.aggregate";

export const FIXED_NOW = new Date("2026-08-01T10:00:00Z");

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

export class RecordingGenerationDispatcher implements GenerationDispatcher {
  readonly dispatched: GenerationDispatchInput[] = [];
  dispatch(input: GenerationDispatchInput): void {
    this.dispatched.push(input);
  }
}

export class InMemoryAuditLogWriter implements AuditLogWriter {
  readonly entries: GenerationAuditLogEntry[] = [];
  async record(entry: GenerationAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

export class InMemoryPromptTemplateRepository implements PromptTemplateRepository {
  private readonly byId = new Map<string, PromptTemplate>();

  async findById(input: { organizationId: string; templateId: string }): Promise<PromptTemplate | null> {
    const template = this.byId.get(input.templateId);
    return template && template.organizationId === input.organizationId ? template : null;
  }

  async findByTaskType(input: { organizationId: string; taskType: GenerationTaskType }): Promise<PromptTemplate | null> {
    for (const template of this.byId.values()) {
      if (template.organizationId === input.organizationId && template.taskType === input.taskType) return template;
    }
    return null;
  }

  async list(input: { organizationId: string; includeArchived: boolean }): Promise<readonly PromptTemplate[]> {
    return [...this.byId.values()].filter(
      (t) => t.organizationId === input.organizationId && (input.includeArchived || !t.archivedAt),
    );
  }

  async create(template: PromptTemplate): Promise<void> {
    this.byId.set(template.id, template);
  }

  async save(template: PromptTemplate): Promise<void> {
    this.byId.set(template.id, template);
  }
}

export class InMemoryPromptVersionRepository implements PromptVersionRepository {
  private readonly byId = new Map<string, PromptVersion>();

  async findById(input: { organizationId: string; versionId: string }): Promise<PromptVersion | null> {
    const version = this.byId.get(input.versionId);
    return version && version.organizationId === input.organizationId ? version : null;
  }

  async findActive(input: { organizationId: string; promptTemplateId: string }): Promise<PromptVersion | null> {
    for (const version of this.byId.values()) {
      if (
        version.organizationId === input.organizationId &&
        version.promptTemplateId === input.promptTemplateId &&
        version.status === PromptVersionStatus.Active
      ) {
        return version;
      }
    }
    return null;
  }

  async listByTemplate(input: { organizationId: string; promptTemplateId: string }): Promise<readonly PromptVersion[]> {
    return [...this.byId.values()].filter(
      (v) => v.organizationId === input.organizationId && v.promptTemplateId === input.promptTemplateId,
    );
  }

  async nextVersionNumber(input: { organizationId: string; promptTemplateId: string }): Promise<number> {
    const versions = await this.listByTemplate(input);
    return versions.length === 0 ? 1 : Math.max(...versions.map((v) => v.version)) + 1;
  }

  async create(version: PromptVersion): Promise<void> {
    this.byId.set(version.id, version);
  }

  async save(version: PromptVersion): Promise<void> {
    this.byId.set(version.id, version);
  }

  /** Reproduit uniquement l'état final de `PrismaPromptVersionRepository.activateAtomically` (pas
   *  la course de concurrence réelle, qui exige PostgreSQL) — même motif documenté que
   *  `InMemoryRoutingPolicyRepository.activateAtomically` (ai-benchmark, Sprint 5.2). */
  async activateAtomically(version: PromptVersion): Promise<void> {
    const currentActive = await this.findActive({ organizationId: version.organizationId, promptTemplateId: version.promptTemplateId });
    if (currentActive && currentActive.id !== version.id) {
      currentActive.archive(version.effectiveFrom ?? new Date());
      this.byId.set(currentActive.id, currentActive);
    }
    this.byId.set(version.id, version);
  }

  /** Utilitaire de test uniquement — simule une violation de l'index unique partiel pour vérifier
   *  la traduction en `PromptVersionActivationConflictError` côté use case. */
  static throwingOnActivate(): InMemoryPromptVersionRepository {
    const repo = new InMemoryPromptVersionRepository();
    repo.activateAtomically = async () => {
      throw new PromptVersionActivationConflictError();
    };
    return repo;
  }
}

export class InMemoryGenerationRepository implements GenerationRepository {
  private readonly byId = new Map<string, Generation>();
  /** Sprint 21 (hardening) — mirroring the DB-managed `updatedAt` column (Prisma `@updatedAt`,
   *  never modeled on the domain aggregate itself), maintained only for
   *  `findStaleGeneratingCandidates` tests. */
  private readonly updatedAtById = new Map<string, Date>();

  async findById(input: { organizationId: string; generationId: string }): Promise<Generation | null> {
    const generation = this.byId.get(input.generationId);
    return generation && generation.organizationId === input.organizationId ? generation : null;
  }

  async findByRoot(input: { organizationId: string; rootGenerationId: string }): Promise<readonly Generation[]> {
    return [...this.byId.values()]
      .filter((g) => g.organizationId === input.organizationId && g.rootGenerationId === input.rootGenerationId)
      .sort((a, b) => a.version - b.version);
  }

  async listByTender(query: ListGenerationsByTenderQuery): Promise<GenerationListResult> {
    const all = [...this.byId.values()].filter(
      (g) => g.organizationId === query.organizationId && g.tenderId === query.tenderId && (!query.taskType || g.taskType === query.taskType),
    );
    const latestPerRoot = new Map<string, Generation>();
    for (const generation of all) {
      const current = latestPerRoot.get(generation.rootGenerationId);
      if (!current || generation.version > current.version) latestPerRoot.set(generation.rootGenerationId, generation);
    }
    const items = [...latestPerRoot.values()];
    return { items: items.slice(query.offset, query.offset + query.limit), total: items.length };
  }

  async findInFlightForTarget(input: {
    organizationId: string;
    tenderId: string;
    taskType: GenerationTaskType;
    targetRef?: string | undefined;
  }): Promise<Generation | null> {
    for (const generation of this.byId.values()) {
      if (
        generation.organizationId === input.organizationId &&
        generation.tenderId === input.tenderId &&
        generation.taskType === input.taskType &&
        (generation.targetRef ?? "") === (input.targetRef ?? "") &&
        (generation.status === GenerationStatus.Pending || generation.status === GenerationStatus.Generating)
      ) {
        return generation;
      }
    }
    return null;
  }

  async create(generation: Generation): Promise<void> {
    this.byId.set(generation.id, generation);
    this.updatedAtById.set(generation.id, new Date());
  }

  async save(generation: Generation): Promise<void> {
    this.byId.set(generation.id, generation);
    this.updatedAtById.set(generation.id, new Date());
  }

  async reserveForGenerating(input: { organizationId: string; generationId: string; occurredAt: Date }): Promise<GenerationReservationOutcome> {
    const generation = await this.findById(input);
    if (!generation || generation.status !== GenerationStatus.Pending) {
      return { kind: "not_startable", status: generation?.status ?? GenerationStatus.Cancelled };
    }
    generation.reserve();
    this.byId.set(generation.id, generation);
    this.updatedAtById.set(generation.id, input.occurredAt);
    return { kind: "reserved", generation };
  }

  async finalizeGeneration(input: {
    organizationId: string;
    generationId: string;
    expectedAttemptCount: number;
    occurredAt: Date;
    outcome: FinalizeGenerationOutcome;
  }): Promise<{ applied: boolean }> {
    const generation = await this.findById(input);
    if (!generation || generation.attemptCount !== input.expectedAttemptCount) {
      return { applied: false };
    }
    if (input.outcome.kind === "generated") {
      generation.markGenerated(input.outcome, input.occurredAt);
    } else {
      generation.markFailed(input.outcome, input.occurredAt);
    }
    this.byId.set(generation.id, generation);
    this.updatedAtById.set(generation.id, input.occurredAt);
    return { applied: true };
  }

  async findStaleGeneratingCandidates(input: { olderThan: Date; limit: number }): Promise<readonly { organizationId: string; generationId: string }[]> {
    return [...this.byId.values()]
      .filter((g) => g.status === GenerationStatus.Generating && (this.updatedAtById.get(g.id) ?? new Date(0)) < input.olderThan)
      .sort((a, b) => (this.updatedAtById.get(a.id) ?? new Date(0)).getTime() - (this.updatedAtById.get(b.id) ?? new Date(0)).getTime())
      .slice(0, input.limit)
      .map((g) => ({ organizationId: g.organizationId, generationId: g.id }));
  }

  async reclaimStaleGenerating(input: { organizationId: string; generationId: string; expectedAttemptCount: number }): Promise<{ applied: boolean }> {
    const generation = await this.findById(input);
    if (!generation || generation.status !== GenerationStatus.Generating || generation.attemptCount !== input.expectedAttemptCount) {
      return { applied: false };
    }
    generation.reclaimStale();
    this.byId.set(generation.id, generation);
    this.updatedAtById.set(generation.id, new Date());
    return { applied: true };
  }
}

export type FakeAIProviderBehavior =
  | { kind: "success"; result: AIProviderResult }
  | { kind: "error"; error: Error };

export class FakeAIProvider implements AIProvider {
  readonly name = "FAKE";
  readonly requests: AIProviderRequest[] = [];
  private readonly behaviors: FakeAIProviderBehavior[];

  constructor(behaviors: readonly FakeAIProviderBehavior[]) {
    this.behaviors = [...behaviors];
  }

  async complete(request: AIProviderRequest): Promise<AIProviderResult> {
    this.requests.push(request);
    const behavior = this.behaviors.shift();
    if (!behavior) throw new Error("FakeAIProvider: no more configured behaviors.");
    if (behavior.kind === "error") throw behavior.error;
    return behavior.result;
  }
}

export class FakeAIProviderRegistry implements AIProviderRegistry {
  constructor(private readonly provider: AIProvider) {}
  resolve(): AIProvider {
    return this.provider;
  }
}

export function fakeAIProviderResult(overrides: Partial<AIProviderResult> = {}): AIProviderResult {
  return {
    content: JSON.stringify({ output: "generated content" }),
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    durationMs: 100,
    ...overrides,
  };
}

export class FakeRoutingPolicyResolver implements RoutingPolicyResolver {
  constructor(private readonly decision: ActiveRoutingDecision | null = null) {}
  async resolveActive(): Promise<ActiveRoutingDecision | null> {
    return this.decision;
  }
}

export class ThrowingRoutingPolicyResolver implements RoutingPolicyResolver {
  async resolveActive(): Promise<ActiveRoutingDecision | null> {
    throw new Error("Simulated routing policy resolution failure (test-only)");
  }
}

/** Correctif Sprint 6 (audit Codex P1-1) — décision de routage active PAR DÉFAUT pour les tests qui
 *  exercent le chemin normal (une RoutingPolicy active existe) : `resolveActive()` retournant `null`
 *  n'est PLUS un cas "par défaut inoffensif" (voir `NoActiveRoutingPolicyError`), il a son propre
 *  test dédié. */
export function defaultActiveRoutingDecision(overrides: Partial<ActiveRoutingDecision> = {}): ActiveRoutingDecision {
  return {
    policyId: "policy-1",
    policyVersion: 1,
    primaryModel: { provider: "OPENAI", modelKey: "gpt-4o-mini" },
    provenanceRequired: false,
    escalationConditions: [],
    timeoutMs: 30000,
    maxRetries: 1,
    ...overrides,
  };
}

/** Correctif Sprint 6 (audit Codex P1-2) — implémentation en mémoire du port PROPRE à Generation,
 *  jamais celui d'Analysis. Enregistre chaque `create`/`complete` pour permettre aux tests de
 *  vérifier qu'une VRAIE décision est bien créée avant l'appel provider et complétée après (jamais
 *  un UUID local fabriqué, jamais une décision "creuse"). */
export class InMemoryRoutingDecisionWriter implements RoutingDecisionWriter {
  readonly created: CreateRoutingDecisionInput[] = [];
  readonly completed: CompleteRoutingDecisionInput[] = [];
  costToReturn: CompleteRoutingDecisionResult = {};

  async create(input: CreateRoutingDecisionInput): Promise<void> {
    this.created.push(input);
  }

  async complete(input: CompleteRoutingDecisionInput): Promise<CompleteRoutingDecisionResult> {
    this.completed.push(input);
    return this.costToReturn;
  }
}

export class ThrowingRoutingDecisionWriter implements RoutingDecisionWriter {
  async create(): Promise<void> {
    throw new Error("Simulated routing decision persistence failure (test-only)");
  }
  async complete(): Promise<CompleteRoutingDecisionResult> {
    throw new Error("Simulated routing decision completion failure (test-only)");
  }
}

/** Reconstruit un vrai `AssertClientAccessUseCase` (client-portfolio) branché sur un fake en
 *  mémoire — jamais une réimplémentation de sa logique d'accès (même motif que
 *  `tenders/test-support/fakes.ts`). Retourne aussi le repository pour permettre aux tests de
 *  seeder des affectations. */
export function buildAssertClientAccessUseCase(): {
  assertClientAccessUseCase: AssertClientAccessUseCase;
  clientAssignmentRepository: InMemoryClientAssignmentRepository;
} {
  const clientAssignmentRepository = new InMemoryClientAssignmentRepository();
  return { assertClientAccessUseCase: new AssertClientAccessUseCase(clientAssignmentRepository), clientAssignmentRepository };
}
