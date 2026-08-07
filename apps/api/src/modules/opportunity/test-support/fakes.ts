import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";
import type { OutboxEventInput, OutboxWriter } from "../../outbox";
import { OpportunityConcurrentModificationError } from "../domain/errors";
import type { GoNoGoDecisionLevel, GoNoGoDecisionValue } from "../domain/go-no-go-decision";
import { Opportunity } from "../domain/opportunity.aggregate";
import { OpportunityStatus } from "../domain/opportunity-status";
import type { AtomicTransactionRunner } from "../application/ports/atomic-transaction-runner";
import type { AuditLogWriter, OpportunityAuditLogEntry } from "../application/ports/audit-log-writer";
import type { CreateGoNoGoDecisionInput, GoNoGoDecisionRecord, GoNoGoDecisionRepository } from "../application/ports/go-no-go-decision.repository";
import type { CreateGoNoGoReportInput, GoNoGoReportRecord, GoNoGoReportRepository } from "../application/ports/go-no-go-report.repository";
import type { OpportunityListFilter, OpportunityPage, OpportunityRepository } from "../application/ports/opportunity.repository";
import type { CreateOpportunityQuickScoreInput, OpportunityQuickScoreRecord, OpportunityQuickScoreRepository } from "../application/ports/opportunity-quick-score.repository";

export const FIXED_NOW = new Date("2026-08-07T14:00:00Z");

export class FixedClock implements Clock {
  constructor(private readonly value: Date = FIXED_NOW) {}
  now(): Date {
    return this.value;
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
  readonly entries: OpportunityAuditLogEntry[] = [];
  async record(entry: OpportunityAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

export class FakeOutboxWriter implements OutboxWriter {
  readonly writes: { organizationId: string; events: OutboxEventInput[] }[] = [];
  async write(input: { organizationId: string; events: OutboxEventInput[] }): Promise<void> {
    this.writes.push(input);
  }
}

/** Simule le comportement transactionnel réel de `PrismaAtomicTransactionRunner` pour un test
 *  unitaire sans Postgres — même motif que `ai-suggestion-bridge`'s FakeAtomicTransactionRunner :
 *  si `fn` lève, restaure les fakes tel qu'ils étaient AVANT l'appel (preuve du rollback logique ;
 *  la preuve du rollback RÉEL cross-table vit dans un test d'intégration Postgres dédié). */
export class FakeAtomicTransactionRunner implements AtomicTransactionRunner {
  constructor(private readonly snapshots: { snapshot(): unknown; restore(state: unknown): void }[]) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const before = this.snapshots.map((s) => s.snapshot());
    try {
      return await fn();
    } catch (error) {
      this.snapshots.forEach((s, i) => s.restore(before[i]));
      throw error;
    }
  }
}

/** Clone indépendant — un vrai `findById` Prisma reconstruit toujours une instance FRAÎCHE depuis
 *  les lignes DB ; muter l'objet retourné ne doit jamais affecter la copie stockée tant que
 *  `save()` n'a pas été appelé (sinon la garde de concurrence optimiste ne peut jamais se déclencher
 *  dans un test, puisque `existing` et l'objet muté seraient la MÊME référence). */
function cloneOpportunity(opportunity: Opportunity): Opportunity {
  return Opportunity.rehydrate({
    id: opportunity.id,
    organizationId: opportunity.organizationId,
    clientAccountId: opportunity.clientAccountId,
    buyerId: opportunity.buyerId,
    title: opportunity.title,
    description: opportunity.description,
    source: opportunity.source,
    externalReference: opportunity.externalReference,
    buyerName: opportunity.buyerName,
    sector: opportunity.sector,
    cpvCode: opportunity.cpvCode,
    location: opportunity.location,
    geographicZone: opportunity.geographicZone,
    publicationDate: opportunity.publicationDate,
    submissionDeadline: opportunity.submissionDeadline,
    estimatedAmount: opportunity.estimatedAmount,
    currency: opportunity.currency,
    procedureType: opportunity.procedureType,
    status: opportunity.status,
    tenderId: opportunity.tenderId,
    createdBy: opportunity.createdBy,
    createdAt: opportunity.createdAt,
    updatedAt: opportunity.updatedAt,
    archivedAt: opportunity.archivedAt,
    version: opportunity.version,
  });
}

export class InMemoryOpportunityRepository implements OpportunityRepository {
  private readonly opportunities = new Map<string, Opportunity>();

  async seed(opportunity: Opportunity): Promise<void> {
    this.opportunities.set(opportunity.id.value, opportunity);
  }

  snapshot(): Map<string, Opportunity> {
    return new Map(this.opportunities);
  }

  restore(state: unknown): void {
    this.opportunities.clear();
    for (const [k, v] of state as Map<string, Opportunity>) this.opportunities.set(k, v);
  }

  async findById(input: { organizationId: string; opportunityId: string }): Promise<Opportunity | null> {
    const opportunity = this.opportunities.get(input.opportunityId);
    if (!opportunity || opportunity.organizationId !== input.organizationId) return null;
    return cloneOpportunity(opportunity);
  }

  async list(input: OpportunityListFilter & { cursor?: string | undefined; limit: number }): Promise<OpportunityPage> {
    let items = [...this.opportunities.values()].filter((o) => o.organizationId === input.organizationId);
    if (input.status) items = items.filter((o) => o.status === input.status);
    if (input.clientAccountId) items = items.filter((o) => o.clientAccountId === input.clientAccountId);
    return { items: items.slice(0, input.limit).map(cloneOpportunity), nextCursor: null };
  }

  async save(opportunity: Opportunity): Promise<void> {
    const existing = this.opportunities.get(opportunity.id.value);
    if (existing && existing.version !== opportunity.version - 1) {
      throw new OpportunityConcurrentModificationError();
    }
    this.opportunities.set(opportunity.id.value, opportunity);
  }

  async transitionToPromoted(input: {
    organizationId: string;
    opportunityId: string;
    fromStatuses: readonly OpportunityStatus[];
    tenderId: string;
    updatedAt: Date;
  }): Promise<Opportunity | null> {
    const current = this.opportunities.get(input.opportunityId);
    if (!current || current.organizationId !== input.organizationId || !input.fromStatuses.includes(current.status)) {
      return null;
    }
    // Réplique la sémantique exacte de `PrismaOpportunityRepository.transitionToPromoted` : un seul
    // `updateMany` compare-and-set qui fixe status=PROMOTED ET tenderId ensemble — jamais via
    // `changeStatus` (qui n'autoriserait pas forcément PROMOTED depuis tous les statuts éligibles
    // ici testés) ni deux écritures séparées.
    const promoted = Opportunity.rehydrate({
      id: current.id,
      organizationId: current.organizationId,
      clientAccountId: current.clientAccountId,
      buyerId: current.buyerId,
      title: current.title,
      description: current.description,
      source: current.source,
      externalReference: current.externalReference,
      buyerName: current.buyerName,
      sector: current.sector,
      cpvCode: current.cpvCode,
      location: current.location,
      geographicZone: current.geographicZone,
      publicationDate: current.publicationDate,
      submissionDeadline: current.submissionDeadline,
      estimatedAmount: current.estimatedAmount,
      currency: current.currency,
      procedureType: current.procedureType,
      status: OpportunityStatus.Promoted,
      tenderId: input.tenderId,
      createdBy: current.createdBy,
      createdAt: current.createdAt,
      updatedAt: input.updatedAt,
      archivedAt: current.archivedAt,
      version: current.version + 1,
    });
    this.opportunities.set(input.opportunityId, promoted);
    return promoted;
  }
}

export class InMemoryOpportunityQuickScoreRepository implements OpportunityQuickScoreRepository {
  private readonly records: OpportunityQuickScoreRecord[] = [];

  async create(input: CreateOpportunityQuickScoreInput): Promise<OpportunityQuickScoreRecord> {
    const scoreVersion = (await this.getLatestVersion({ organizationId: input.organizationId, opportunityId: input.opportunityId })) + 1;
    const record: OpportunityQuickScoreRecord = {
      id: input.id,
      organizationId: input.organizationId,
      opportunityId: input.opportunityId,
      scoreVersion,
      calculationVersion: input.calculationVersion,
      requestedByUserId: input.requestedByUserId,
      dataSnapshot: input.dataSnapshot,
      createdAt: input.createdAt.toISOString(),
      ...input.result,
    };
    this.records.push(record);
    return record;
  }

  async getLatestVersion(input: { organizationId: string; opportunityId: string }): Promise<number> {
    const versions = this.records.filter((r) => r.organizationId === input.organizationId && r.opportunityId === input.opportunityId).map((r) => r.scoreVersion);
    return versions.length === 0 ? 0 : Math.max(...versions);
  }

  async getLatest(input: { organizationId: string; opportunityId: string }): Promise<OpportunityQuickScoreRecord | null> {
    const versions = await this.listVersions(input);
    return versions[0] ?? null;
  }

  async listVersions(input: { organizationId: string; opportunityId: string }): Promise<OpportunityQuickScoreRecord[]> {
    return this.records
      .filter((r) => r.organizationId === input.organizationId && r.opportunityId === input.opportunityId)
      .sort((a, b) => b.scoreVersion - a.scoreVersion);
  }
}

export class InMemoryGoNoGoReportRepository implements GoNoGoReportRepository {
  private readonly records: GoNoGoReportRecord[] = [];

  async create(input: CreateGoNoGoReportInput): Promise<GoNoGoReportRecord> {
    const reportVersion = (await this.getLatestVersion({ organizationId: input.organizationId, tenderId: input.tenderId })) + 1;
    const record: GoNoGoReportRecord = {
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      reportVersion,
      analysisVersion: input.analysisVersion,
      calculationVersion: input.calculationVersion,
      requestedByUserId: input.requestedByUserId,
      generatedAt: input.generatedAt.toISOString(),
      ...input.result,
    };
    this.records.push(record);
    return record;
  }

  async getLatestVersion(input: { organizationId: string; tenderId: string }): Promise<number> {
    const versions = this.records.filter((r) => r.organizationId === input.organizationId && r.tenderId === input.tenderId).map((r) => r.reportVersion);
    return versions.length === 0 ? 0 : Math.max(...versions);
  }

  async getLatest(input: { organizationId: string; tenderId: string }): Promise<GoNoGoReportRecord | null> {
    const versions = await this.listVersions(input);
    return versions[0] ?? null;
  }

  async listVersions(input: { organizationId: string; tenderId: string }): Promise<GoNoGoReportRecord[]> {
    return this.records.filter((r) => r.organizationId === input.organizationId && r.tenderId === input.tenderId).sort((a, b) => b.reportVersion - a.reportVersion);
  }

  async findById(input: { organizationId: string; tenderId: string; reportId: string }): Promise<GoNoGoReportRecord | null> {
    return this.records.find((r) => r.organizationId === input.organizationId && r.tenderId === input.tenderId && r.id === input.reportId) ?? null;
  }
}

export class InMemoryGoNoGoDecisionRepository implements GoNoGoDecisionRepository {
  readonly records: GoNoGoDecisionRecord[] = [];
  private seq = 0;

  snapshot(): GoNoGoDecisionRecord[] {
    return [...this.records];
  }

  restore(state: unknown): void {
    this.records.length = 0;
    this.records.push(...(state as GoNoGoDecisionRecord[]));
  }

  async create(input: CreateGoNoGoDecisionInput): Promise<GoNoGoDecisionRecord> {
    this.seq += 1;
    const record: GoNoGoDecisionRecord = {
      id: input.id,
      organizationId: input.organizationId,
      level: input.level,
      opportunityId: input.opportunityId,
      tenderId: input.tenderId,
      linkedQuickScoreId: input.linkedQuickScoreId,
      linkedReportId: input.linkedReportId,
      decision: input.decision,
      justification: input.justification,
      conditions: input.conditions,
      comment: input.comment,
      actorId: input.actorId,
      decidedAt: input.decidedAt.toISOString(),
    };
    this.records.push(record);
    return record;
  }

  private byLevel(level: GoNoGoDecisionLevel, key: "opportunityId" | "tenderId", value: string): GoNoGoDecisionRecord[] {
    return this.records.filter((r) => r.level === level && r[key] === value).sort((a, b) => this.records.indexOf(b) - this.records.indexOf(a));
  }

  async listByOpportunity(input: { organizationId: string; opportunityId: string }): Promise<GoNoGoDecisionRecord[]> {
    return this.byLevel("OPPORTUNITY" as GoNoGoDecisionLevel, "opportunityId", input.opportunityId).filter((r) => r.organizationId === input.organizationId);
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<GoNoGoDecisionRecord[]> {
    return this.byLevel("TENDER" as GoNoGoDecisionLevel, "tenderId", input.tenderId).filter((r) => r.organizationId === input.organizationId);
  }

  async getLatestByOpportunity(input: { organizationId: string; opportunityId: string }): Promise<GoNoGoDecisionRecord | null> {
    const list = await this.listByOpportunity(input);
    return list[0] ?? null;
  }

  async getLatestByTender(input: { organizationId: string; tenderId: string }): Promise<GoNoGoDecisionRecord | null> {
    const list = await this.listByTender(input);
    return list[0] ?? null;
  }
}

export type GoNoGoDecisionValueLiteral = GoNoGoDecisionValue;
