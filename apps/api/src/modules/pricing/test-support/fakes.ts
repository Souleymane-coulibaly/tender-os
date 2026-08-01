import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase } from "../../client-portfolio";
import { InMemoryClientAssignmentRepository } from "../../client-portfolio/test-support/fakes";
import type { AuditLogWriter, PricingAuditLogEntry } from "../application/ports/audit-log-writer";
import type {
  GenerationCostFilter,
  GenerationCostListResult,
  GenerationCostReader,
  GenerationCostRow,
} from "../application/ports/generation-cost-reader";
import type {
  ListPricingEstimatesQuery,
  ListPricingEstimatesResult,
  PricingEstimateRepository,
  PricingEstimateWithVersion,
} from "../application/ports/pricing-estimate.repository";
import type { CurrentModelPricing, PricingSnapshotReader } from "../application/ports/pricing-snapshot-reader";
import type { RoutedModel, RoutingModelReader } from "../application/ports/routing-model-reader";
import { PricingEstimateConcurrentRecalculationError } from "../domain/errors";
import type { PricingEstimate } from "../domain/pricing-estimate.aggregate";
import type { PricingEstimateVersion } from "../domain/pricing-estimate-version.entity";

export const FIXED_NOW = new Date("2026-08-15T10:00:00Z");

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
  readonly entries: PricingAuditLogEntry[] = [];
  async record(entry: PricingAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

export class InMemoryGenerationCostReader implements GenerationCostReader {
  readonly rows: GenerationCostRow[] = [];
  averageOverride: { averageInputTokens: number; averageOutputTokens: number; sampleSize: number } | null = null;

  async list(filter: GenerationCostFilter): Promise<GenerationCostListResult> {
    const items = this.rows.filter(
      (row) =>
        (!filter.tenderId || row.tenderId === filter.tenderId) &&
        (!filter.clientAccountId || row.clientAccountId === filter.clientAccountId) &&
        (!filter.taskType || row.taskType === filter.taskType),
    );
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? items.length;
    return { items: items.slice(offset, offset + limit), total: items.length };
  }

  async findById(input: { organizationId: string; generationId: string }): Promise<GenerationCostRow | null> {
    return this.rows.find((row) => row.generationId === input.generationId) ?? null;
  }

  async averageTokensForTaskType(): Promise<{ averageInputTokens: number; averageOutputTokens: number; sampleSize: number } | null> {
    return this.averageOverride;
  }
}

export class FakeRoutingModelReader implements RoutingModelReader {
  constructor(private readonly model: RoutedModel | null = null) {}
  async resolveActiveModel(): Promise<RoutedModel | null> {
    return this.model;
  }
}

export class FakePricingSnapshotReader implements PricingSnapshotReader {
  constructor(private readonly pricing: CurrentModelPricing | null = null) {}
  async findCurrentForModel(): Promise<CurrentModelPricing | null> {
    return this.pricing;
  }
}

export class InMemoryPricingEstimateRepository implements PricingEstimateRepository {
  private readonly estimates = new Map<string, PricingEstimate>();
  private readonly versions = new Map<string, PricingEstimateVersion[]>();

  async findById(input: { organizationId: string; estimateId: string }): Promise<PricingEstimateWithVersion | null> {
    const estimate = this.estimates.get(input.estimateId);
    if (!estimate || estimate.organizationId !== input.organizationId || !estimate.currentVersionId) return null;
    const version = (this.versions.get(estimate.id) ?? []).find((v) => v.id === estimate.currentVersionId);
    if (!version) return null;
    return { estimate, version };
  }

  async findVersion(input: { organizationId: string; estimateId: string; version: number }): Promise<PricingEstimateVersion | null> {
    const versions = this.versions.get(input.estimateId) ?? [];
    return versions.find((v) => v.organizationId === input.organizationId && v.version === input.version) ?? null;
  }

  async listVersions(input: { organizationId: string; estimateId: string }): Promise<readonly PricingEstimateVersion[]> {
    return (this.versions.get(input.estimateId) ?? []).filter((v) => v.organizationId === input.organizationId).sort((a, b) => a.version - b.version);
  }

  async list(query: ListPricingEstimatesQuery): Promise<ListPricingEstimatesResult> {
    const all = [...this.estimates.values()].filter(
      (estimate) =>
        estimate.organizationId === query.organizationId &&
        (!query.tenderId || estimate.tenderId === query.tenderId) &&
        (!query.clientAccountId || estimate.clientAccountId === query.clientAccountId) &&
        (!query.type || estimate.type === query.type) &&
        (query.includeArchived || estimate.status !== "ARCHIVED"),
    );
    const items: PricingEstimateWithVersion[] = [];
    for (const estimate of all) {
      const version = (this.versions.get(estimate.id) ?? []).find((v) => v.id === estimate.currentVersionId);
      if (version) items.push({ estimate, version });
    }
    return { items: items.slice(query.offset, query.offset + query.limit), total: items.length };
  }

  async createWithFirstVersion(input: { estimate: PricingEstimate; version: PricingEstimateVersion }): Promise<void> {
    this.estimates.set(input.estimate.id, input.estimate);
    this.versions.set(input.estimate.id, [input.version]);
  }

  async addVersion(input: { estimate: PricingEstimate; previousVersion: PricingEstimateVersion; newVersion: PricingEstimateVersion }): Promise<void> {
    const existing = this.versions.get(input.estimate.id) ?? [];
    if (existing.some((v) => v.version === input.newVersion.version)) {
      throw new PricingEstimateConcurrentRecalculationError();
    }
    this.versions.set(input.estimate.id, [...existing, input.newVersion]);
    this.estimates.set(input.estimate.id, input.estimate);
  }

  async save(estimate: PricingEstimate): Promise<void> {
    this.estimates.set(estimate.id, estimate);
  }
}

/** Reconstruit un vrai `AssertClientAccessUseCase` (client-portfolio) branché sur un fake en
 *  mémoire — même motif que `generation/test-support/fakes.ts`. */
export function buildAssertClientAccessUseCase(): {
  assertClientAccessUseCase: AssertClientAccessUseCase;
  clientAssignmentRepository: InMemoryClientAssignmentRepository;
} {
  const clientAssignmentRepository = new InMemoryClientAssignmentRepository();
  return { assertClientAccessUseCase: new AssertClientAccessUseCase(clientAssignmentRepository), clientAssignmentRepository };
}
