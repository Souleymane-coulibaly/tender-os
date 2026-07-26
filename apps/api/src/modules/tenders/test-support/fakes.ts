import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";
import type { Alert } from "../domain/alert.entity";
import type { AwardCriterion } from "../domain/award-criterion.entity";
import type { ChecklistItem } from "../domain/checklist-item.entity";
import type { Milestone } from "../domain/milestone.entity";
import type { RequestedDocument } from "../domain/requested-document.entity";
import type { Risk } from "../domain/risk.entity";
import type { Tender } from "../domain/tender.aggregate";
import type { AlertRepository } from "../application/ports/alert.repository";
import type { AuditLogWriter, TenderAuditLogEntry } from "../application/ports/audit-log-writer";
import type { AwardCriterionRepository } from "../application/ports/award-criterion.repository";
import type { ChecklistItemRepository } from "../application/ports/checklist-item.repository";
import type { MilestoneRepository } from "../application/ports/milestone.repository";
import type { RequestedDocumentRepository } from "../application/ports/requested-document.repository";
import type { RiskRepository } from "../application/ports/risk.repository";
import type { TenderSearchCriteria, TenderSearchProvider } from "../application/ports/tender-search-provider";
import type {
  TenderStatusHistoryEntry,
  TenderStatusHistoryRepository,
} from "../application/ports/tender-status-history.repository";
import type { TenderPage, TenderRepository } from "../application/ports/tender.repository";
import { TenderStatus } from "../domain/tender-status";

const OVERDUE_EXEMPT_STATUSES: readonly string[] = [
  TenderStatus.Submitted,
  TenderStatus.Won,
  TenderStatus.Lost,
  TenderStatus.Archived,
];

export const FIXED_NOW = new Date("2026-07-26T14:00:00Z");

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
  readonly entries: TenderAuditLogEntry[] = [];

  async record(entry: TenderAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

type InMemoryTenderFilter = {
  organizationId: string;
  status?: string | undefined;
  internalOwnerId?: string | undefined;
  idsFilter?: readonly string[] | undefined;
  deadlineAfter?: Date | undefined;
  deadlineBefore?: Date | undefined;
  overdue?: boolean | undefined;
};

export class InMemoryTenderRepository implements TenderRepository {
  private readonly tenders = new Map<string, Tender>();

  async seed(tender: Tender): Promise<void> {
    this.tenders.set(tender.id.value, tender);
  }

  async findById(input: { organizationId: string; tenderId: string }): Promise<Tender | null> {
    const tender = this.tenders.get(input.tenderId);
    if (!tender || tender.organizationId !== input.organizationId) {
      return null;
    }
    return tender;
  }

  private filtered(input: InMemoryTenderFilter): Tender[] {
    if (input.idsFilter && input.idsFilter.length === 0) {
      return [];
    }

    let items = [...this.tenders.values()].filter((tender) => tender.organizationId === input.organizationId);

    if (input.status) {
      items = items.filter((tender) => tender.status === input.status);
    }
    if (input.internalOwnerId) {
      items = items.filter((tender) => tender.internalOwnerId === input.internalOwnerId);
    }
    if (input.idsFilter) {
      const allowed = new Set(input.idsFilter);
      items = items.filter((tender) => allowed.has(tender.id.value));
    }
    if (input.deadlineAfter) {
      items = items.filter(
        (tender) => tender.submissionDeadline !== undefined && tender.submissionDeadline >= input.deadlineAfter!,
      );
    }
    if (input.deadlineBefore) {
      items = items.filter(
        (tender) => tender.submissionDeadline !== undefined && tender.submissionDeadline <= input.deadlineBefore!,
      );
    }
    if (input.overdue) {
      const now = new Date();
      items = items.filter(
        (tender) =>
          tender.submissionDeadline !== undefined &&
          tender.submissionDeadline < now &&
          !OVERDUE_EXEMPT_STATUSES.includes(tender.status),
      );
    }

    return items;
  }

  async list(
    input: InMemoryTenderFilter & { cursor?: string | undefined; limit: number },
  ): Promise<TenderPage> {
    const items = this.filtered(input);
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const startIndex = input.cursor ? items.findIndex((tender) => tender.id.value === input.cursor) + 1 : 0;
    const page = items.slice(startIndex, startIndex + input.limit);
    const hasNextPage = startIndex + input.limit < items.length;

    return { items: page, nextCursor: hasNextPage ? (page[page.length - 1]?.id.value ?? null) : null };
  }

  async count(input: InMemoryTenderFilter): Promise<number> {
    return this.filtered(input).length;
  }

  async countByStatus(organizationId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const tender of this.tenders.values()) {
      if (tender.organizationId !== organizationId) continue;
      counts[tender.status] = (counts[tender.status] ?? 0) + 1;
    }
    return counts;
  }

  async save(tender: Tender): Promise<void> {
    this.tenders.set(tender.id.value, tender);
  }
}

/** Implémentation en mémoire du même contrat que PrismaIlikeTenderSearchProvider — une
 *  correspondance texte simple, cohérente avec l'implémentation réelle pour les tests. */
export class InMemoryTenderSearchProvider implements TenderSearchProvider {
  constructor(private readonly repository: InMemoryTenderRepository) {}

  async findMatchingTenderIds(criteria: TenderSearchCriteria): Promise<string[]> {
    const needle = criteria.query.toLowerCase();
    const page = await this.repository.list({ organizationId: criteria.organizationId, limit: 500 });
    return page.items.filter((tender) => tender.title.toLowerCase().includes(needle)).map((tender) => tender.id.value);
  }
}

export class InMemoryTenderStatusHistoryRepository implements TenderStatusHistoryRepository {
  readonly entries: TenderStatusHistoryEntry[] = [];

  async listByTender(): Promise<TenderStatusHistoryEntry[]> {
    return this.entries;
  }

  async append(input: {
    organizationId: string;
    tenderId: string;
    previousStatus: string | null;
    newStatus: string;
    reason?: string | undefined;
    changedBy: string;
    occurredAt: Date;
  }): Promise<void> {
    this.entries.push({
      id: `history-${this.entries.length + 1}`,
      previousStatus: input.previousStatus,
      newStatus: input.newStatus,
      reason: input.reason ?? null,
      changedBy: input.changedBy,
      changedAt: input.occurredAt.toISOString(),
    });
  }
}

export class InMemoryRiskRepository implements RiskRepository {
  private readonly risks = new Map<string, Risk>();

  async seed(risk: Risk): Promise<void> {
    this.risks.set(risk.id, risk);
  }

  async findById(input: { organizationId: string; tenderId: string; riskId: string }): Promise<Risk | null> {
    const risk = this.risks.get(input.riskId);
    if (!risk || risk.organizationId !== input.organizationId || risk.tenderId !== input.tenderId) {
      return null;
    }
    return risk;
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<Risk[]> {
    return [...this.risks.values()].filter(
      (risk) => risk.organizationId === input.organizationId && risk.tenderId === input.tenderId,
    );
  }

  async listByTenderIds(input: { organizationId: string; tenderIds: readonly string[] }): Promise<Risk[]> {
    const allowed = new Set(input.tenderIds);
    return [...this.risks.values()].filter(
      (risk) => risk.organizationId === input.organizationId && allowed.has(risk.tenderId),
    );
  }

  async save(risk: Risk): Promise<void> {
    this.risks.set(risk.id, risk);
  }
}

export class InMemoryAlertRepository implements AlertRepository {
  private readonly alerts = new Map<string, Alert>();

  async seed(alert: Alert): Promise<void> {
    this.alerts.set(alert.id, alert);
  }

  async findById(input: { organizationId: string; tenderId: string; alertId: string }): Promise<Alert | null> {
    const alert = this.alerts.get(input.alertId);
    if (!alert || alert.organizationId !== input.organizationId || alert.tenderId !== input.tenderId) {
      return null;
    }
    return alert;
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<Alert[]> {
    return [...this.alerts.values()].filter(
      (alert) => alert.organizationId === input.organizationId && alert.tenderId === input.tenderId,
    );
  }

  async listByTenderIds(input: { organizationId: string; tenderIds: readonly string[] }): Promise<Alert[]> {
    const allowed = new Set(input.tenderIds);
    return [...this.alerts.values()].filter(
      (alert) => alert.organizationId === input.organizationId && allowed.has(alert.tenderId),
    );
  }

  async save(alert: Alert): Promise<void> {
    this.alerts.set(alert.id, alert);
  }
}

export class InMemoryChecklistItemRepository implements ChecklistItemRepository {
  readonly items: ChecklistItem[] = [];

  async findById(): Promise<ChecklistItem | null> {
    return null;
  }

  async listByTender(): Promise<ChecklistItem[]> {
    return this.items;
  }

  async listByTenderIds(input: { organizationId: string; tenderIds: readonly string[] }): Promise<ChecklistItem[]> {
    const allowed = new Set(input.tenderIds);
    return this.items.filter((item) => item.organizationId === input.organizationId && allowed.has(item.tenderId));
  }

  async save(): Promise<void> {}
}

export class InMemoryRequestedDocumentRepository implements RequestedDocumentRepository {
  readonly documents: RequestedDocument[] = [];

  async findById(): Promise<RequestedDocument | null> {
    return null;
  }

  async listByTender(): Promise<RequestedDocument[]> {
    return this.documents;
  }

  async listByTenderIds(input: {
    organizationId: string;
    tenderIds: readonly string[];
  }): Promise<RequestedDocument[]> {
    const allowed = new Set(input.tenderIds);
    return this.documents.filter((doc) => doc.organizationId === input.organizationId && allowed.has(doc.tenderId));
  }

  async save(): Promise<void> {}

  async delete(): Promise<void> {}
}

export class InMemoryAwardCriterionRepository implements AwardCriterionRepository {
  readonly criteria: AwardCriterion[] = [];

  async findById(): Promise<AwardCriterion | null> {
    return null;
  }

  async listByTender(): Promise<AwardCriterion[]> {
    return this.criteria;
  }

  async listByTenderIds(input: { organizationId: string; tenderIds: readonly string[] }): Promise<AwardCriterion[]> {
    const allowed = new Set(input.tenderIds);
    return this.criteria.filter(
      (criterion) => criterion.organizationId === input.organizationId && allowed.has(criterion.tenderId),
    );
  }

  async save(): Promise<void> {}

  async delete(): Promise<void> {}
}

export class InMemoryMilestoneRepository implements MilestoneRepository {
  readonly milestones: Milestone[] = [];

  async findById(): Promise<Milestone | null> {
    return null;
  }

  async listByTender(): Promise<Milestone[]> {
    return this.milestones;
  }

  async listByTenderIds(input: { organizationId: string; tenderIds: readonly string[] }): Promise<Milestone[]> {
    const allowed = new Set(input.tenderIds);
    return this.milestones.filter(
      (milestone) => milestone.organizationId === input.organizationId && allowed.has(milestone.tenderId),
    );
  }

  async save(): Promise<void> {}

  async delete(): Promise<void> {}
}
