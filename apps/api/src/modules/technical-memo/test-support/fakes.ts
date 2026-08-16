import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";
import type { AIProvider, AIProviderRegistry, AIProviderRequest, AIProviderResult } from "../../analysis";
import type { AtomicTransactionRunner } from "../application/ports/atomic-transaction-runner";
import type { AuditLogWriter, TechnicalMemoAuditLogEntry } from "../application/ports/audit-log-writer";
import type { TechnicalMemoSectionRepository } from "../application/ports/technical-memo-section.repository";
import type { TechnicalMemoSectionRequirementRepository } from "../application/ports/technical-memo-section-requirement.repository";
import type { TechnicalMemoSectionRevisionRepository } from "../application/ports/technical-memo-section-revision.repository";
import type { TechnicalMemoRepository } from "../application/ports/technical-memo.repository";
import type { CompleteRoutingDecisionInput, CreateRoutingDecisionInput, RoutingDecisionWriter } from "../application/ports/routing-decision-writer";
import type { TechnicalMemo } from "../domain/technical-memo.aggregate";
import type { TechnicalMemoSection } from "../domain/technical-memo-section.entity";
import type { TechnicalMemoSectionCitation } from "../domain/technical-memo-section-citation.value-object";
import type { TechnicalMemoSectionRequirement } from "../domain/technical-memo-section-requirement.entity";
import type { TechnicalMemoSectionRevision } from "../domain/technical-memo-section-revision.entity";

export class FixedClock implements Clock {
  constructor(private value: Date = new Date("2026-01-01T00:00:00.000Z")) {}
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

export class FakeAtomicTransactionRunner implements AtomicTransactionRunner {
  async run<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

export class InMemoryAuditLogWriter implements AuditLogWriter {
  readonly entries: TechnicalMemoAuditLogEntry[] = [];
  async record(entry: TechnicalMemoAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

export class InMemoryTechnicalMemoRepository implements TechnicalMemoRepository {
  readonly memos: TechnicalMemo[] = [];
  async create(memo: TechnicalMemo): Promise<void> {
    this.memos.push(memo);
  }
  async save(memo: TechnicalMemo): Promise<void> {
    const index = this.memos.findIndex((m) => m.id === memo.id);
    if (index === -1) this.memos.push(memo);
    else this.memos[index] = memo;
  }
  async findById(input: { organizationId: string; technicalMemoId: string }): Promise<TechnicalMemo | null> {
    return this.memos.find((m) => m.id === input.technicalMemoId && m.organizationId === input.organizationId) ?? null;
  }
  async findByScope(input: { organizationId: string; tenderId: string; lotId: string | null }): Promise<TechnicalMemo | null> {
    return this.memos.find((m) => m.organizationId === input.organizationId && m.tenderId === input.tenderId && (m.lotId ?? null) === input.lotId) ?? null;
  }
  async list(input: { organizationId: string; tenderId: string }): Promise<readonly TechnicalMemo[]> {
    return this.memos.filter((m) => m.organizationId === input.organizationId && m.tenderId === input.tenderId);
  }
}

export class InMemoryTechnicalMemoSectionRepository implements TechnicalMemoSectionRepository {
  readonly sections: TechnicalMemoSection[] = [];
  async createMany(sections: readonly TechnicalMemoSection[]): Promise<void> {
    this.sections.push(...sections);
  }
  async save(section: TechnicalMemoSection): Promise<void> {
    const index = this.sections.findIndex((s) => s.id === section.id);
    if (index === -1) this.sections.push(section);
    else this.sections[index] = section;
  }
  async findById(input: { organizationId: string; technicalMemoSectionId: string }): Promise<TechnicalMemoSection | null> {
    return this.sections.find((s) => s.id === input.technicalMemoSectionId && s.organizationId === input.organizationId) ?? null;
  }
  async listByMemoId(input: { organizationId: string; technicalMemoId: string }): Promise<readonly TechnicalMemoSection[]> {
    return this.sections.filter((s) => s.organizationId === input.organizationId && s.technicalMemoId === input.technicalMemoId).sort((a, b) => a.order - b.order);
  }
  async countByMemoId(input: { organizationId: string; technicalMemoId: string }): Promise<number> {
    return this.sections.filter((s) => s.organizationId === input.organizationId && s.technicalMemoId === input.technicalMemoId).length;
  }
}

export class InMemoryTechnicalMemoSectionRevisionRepository implements TechnicalMemoSectionRevisionRepository {
  readonly revisions: TechnicalMemoSectionRevision[] = [];
  async lockSection(): Promise<void> {
    // Pas de verrou réel en mémoire (un seul thread de test) — voir le repository Prisma réel pour
    // le verrou consultatif Postgres.
  }
  async create(input: { revision: TechnicalMemoSectionRevision; citations: readonly TechnicalMemoSectionCitation[] }): Promise<void> {
    this.revisions.push(input.revision);
  }
  async findById(input: { organizationId: string; revisionId: string }): Promise<TechnicalMemoSectionRevision | null> {
    return this.revisions.find((r) => r.id === input.revisionId && r.organizationId === input.organizationId) ?? null;
  }
  async listBySectionId(input: { organizationId: string; technicalMemoSectionId: string }): Promise<readonly TechnicalMemoSectionRevision[]> {
    return this.revisions.filter((r) => r.organizationId === input.organizationId && r.technicalMemoSectionId === input.technicalMemoSectionId).sort((a, b) => b.revisionNumber - a.revisionNumber);
  }
  async findLatestBySectionId(input: { organizationId: string; technicalMemoSectionId: string }): Promise<TechnicalMemoSectionRevision | null> {
    const list = await this.listBySectionId(input);
    return list[0] ?? null;
  }
  async nextRevisionNumber(input: { organizationId: string; technicalMemoSectionId: string }): Promise<number> {
    const list = await this.listBySectionId(input);
    return (list[0]?.revisionNumber ?? 0) + 1;
  }
}

export class InMemoryTechnicalMemoSectionRequirementRepository implements TechnicalMemoSectionRequirementRepository {
  readonly links: TechnicalMemoSectionRequirement[] = [];
  async createMany(links: readonly TechnicalMemoSectionRequirement[]): Promise<void> {
    this.links.push(...links);
  }
  async save(link: TechnicalMemoSectionRequirement): Promise<void> {
    const index = this.links.findIndex((l) => l.id === link.id);
    if (index === -1) this.links.push(link);
    else this.links[index] = link;
  }
  async findById(input: { organizationId: string; technicalMemoSectionRequirementId: string }): Promise<TechnicalMemoSectionRequirement | null> {
    return this.links.find((l) => l.id === input.technicalMemoSectionRequirementId && l.organizationId === input.organizationId) ?? null;
  }
  async listBySectionId(input: { organizationId: string; technicalMemoSectionId: string }): Promise<readonly TechnicalMemoSectionRequirement[]> {
    return this.links.filter((l) => l.organizationId === input.organizationId && l.technicalMemoSectionId === input.technicalMemoSectionId);
  }
  async listByMemoId(input: { organizationId: string; technicalMemoId: string }): Promise<readonly TechnicalMemoSectionRequirement[]> {
    return this.links.filter((l) => l.organizationId === input.organizationId);
  }
}

export type FakeAIProviderBehavior = { kind: "success"; result: AIProviderResult } | { kind: "error"; error: Error };

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

/** Consolidation IA — Checkpoint A §3/§5 (tests) — fake du port propre à Mémoire technique
 *  (`technical-memo/application/ports/routing-policy-resolver.ts`), même motif que le fake
 *  homonyme de `chat/test-support/fakes.ts`. `decision: null` (défaut) reproduit l'absence de
 *  `RoutingPolicy` active : `GenerateTechnicalMemoSectionUseCase` doit retomber sur
 *  `TechnicalMemoAiConfig.aiModel` sans jamais lever. */
export class FakeRoutingPolicyResolver {
  calls: { organizationId: string; promptKey: string }[] = [];
  constructor(
    private readonly decision: { policyId: string; policyVersion: number; primaryModel: { provider: string; modelKey: string } } | null = null,
    private readonly throwOnResolve = false,
  ) {}
  async resolveActive(input: { organizationId: string; promptKey: string }) {
    this.calls.push(input);
    if (this.throwOnResolve) throw new Error("simulated routing policy resolution failure");
    return this.decision;
  }
}

/** Consolidation IA — Checkpoint D (tests) — même motif que `analysis/test-support/fakes.ts`/
 *  `chat/test-support/fakes.ts` : enregistre chaque appel `create`/`complete` pour permettre aux
 *  tests d'affirmer qu'une décision de routage a bien été créée AVANT le premier appel provider et
 *  complétée exactement une fois, sans dépendre d'une base réelle. */
export class RecordingRoutingDecisionWriter implements RoutingDecisionWriter {
  readonly created: CreateRoutingDecisionInput[] = [];
  readonly completed: CompleteRoutingDecisionInput[] = [];

  async create(input: CreateRoutingDecisionInput): Promise<void> {
    this.created.push(input);
  }

  async complete(input: CompleteRoutingDecisionInput): Promise<void> {
    this.completed.push(input);
  }
}

export class ThrowingRoutingDecisionWriter implements RoutingDecisionWriter {
  async create(): Promise<void> {
    throw new Error("Simulated routing decision write failure (test-only)");
  }
  async complete(): Promise<void> {
    throw new Error("Simulated routing decision write failure (test-only)");
  }
}

export function fakeSectionAIProviderResult(overrides: Partial<AIProviderResult> = {}): AIProviderResult {
  return {
    content: JSON.stringify({ content: "Texte généré pour cette section.", citations: [], missingDataNotes: [] }),
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    durationMs: 100,
    ...overrides,
  };
}
