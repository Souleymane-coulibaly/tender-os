import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, GetClientAccountUseCase, ListAccessibleClientsUseCase } from "../../client-portfolio";
import { ClientAccount } from "../../client-portfolio/domain/client-account.aggregate";
import { ClientAssignment } from "../../client-portfolio/domain/client-assignment.entity";
import { ClientRole } from "../../client-portfolio/domain/client-role";
import { InMemoryClientAccountRepository, InMemoryClientAssignmentRepository } from "../../client-portfolio/test-support/fakes";
import type { Alert } from "../domain/alert.entity";
import type { AwardCriterion } from "../domain/award-criterion.entity";
import type { ChecklistItem } from "../domain/checklist-item.entity";
import type { Milestone } from "../domain/milestone.entity";
import type { RequestedDocument } from "../domain/requested-document.entity";
import type { Risk } from "../domain/risk.entity";
import type { Tender } from "../domain/tender.aggregate";
import type { TenderLot } from "../domain/tender-lot.entity";
import { DuplicateTenderLotNumberError } from "../domain/errors";
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
import type { TenderLotRepository } from "../application/ports/tender-lot.repository";
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

export const DEFAULT_TEST_CLIENT_ACCOUNT_ID = "client-1";

/**
 * Câblage minimal du module Client Portfolio pour les tests unitaires Tenders (mission Sprint 5.1)
 * — un seul client ACTIVE (`DEFAULT_TEST_CLIENT_ACCOUNT_ID`) pré-créé dans `organizationId`, avec
 * "user-1" (l'acteur par défaut de la plupart des tests Tenders déjà existants) affecté en
 * CLIENT_MANAGER — un rôle MEMBER-tier (ex. BID_MANAGER) a TOUJOURS besoin d'une affectation
 * explicite (mission §"MEMBER : seulement les clients auxquels il est affecté"), jamais d'un accès
 * implicite. Réutilise directement les fakes déjà éprouvés du module Client Portfolio
 * (`InMemoryClientAccountRepository`/`InMemoryClientAssignmentRepository`) plutôt que d'en
 * dupliquer une seconde implémentation.
 */
export async function createClientPortfolioTestFixture(organizationId: string, clientAccountId: string = DEFAULT_TEST_CLIENT_ACCOUNT_ID) {
  const clientAccountRepository = new InMemoryClientAccountRepository();
  const clientAssignmentRepository = new InMemoryClientAssignmentRepository();
  const assertClientAccessUseCase = new AssertClientAccessUseCase(clientAssignmentRepository);
  const getClientAccountUseCase = new GetClientAccountUseCase(clientAccountRepository, assertClientAccessUseCase);
  const listAccessibleClientsUseCase = new ListAccessibleClientsUseCase(clientAssignmentRepository);

  const client = ClientAccount.create({ id: clientAccountId, organizationId, name: "Client de test", createdBy: "user-1", occurredAt: FIXED_NOW });
  await clientAccountRepository.create(client);

  async function assignUser(userId: string, role: ClientRole = ClientRole.ClientManager): Promise<void> {
    await clientAssignmentRepository.create(
      ClientAssignment.create({ id: `assignment-${userId}`, organizationId, clientAccountId, userId, role, createdBy: "user-1", occurredAt: FIXED_NOW }),
    );
  }
  await assignUser("user-1");

  return {
    clientAccountRepository,
    clientAssignmentRepository,
    assertClientAccessUseCase,
    getClientAccountUseCase,
    listAccessibleClientsUseCase,
    clientAccountId,
    assignUser,
  };
}

type InMemoryTenderFilter = {
  organizationId: string;
  status?: string | undefined;
  internalOwnerId?: string | undefined;
  clientAccountId?: string | undefined;
  restrictToClientAccountIds?: readonly string[] | undefined;
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
    if (input.clientAccountId) {
      items = items.filter((tender) => tender.clientAccountId === input.clientAccountId);
    }
    if (input.restrictToClientAccountIds) {
      const allowedClients = new Set(input.restrictToClientAccountIds);
      items = items.filter((tender) => allowedClients.has(tender.clientAccountId));
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

  async countByStatus(input: { organizationId: string; restrictToClientAccountIds?: readonly string[] | undefined }): Promise<Record<string, number>> {
    const allowedClients = input.restrictToClientAccountIds ? new Set(input.restrictToClientAccountIds) : undefined;
    const counts: Record<string, number> = {};
    for (const tender of this.tenders.values()) {
      if (tender.organizationId !== input.organizationId) continue;
      if (allowedClients && !allowedClients.has(tender.clientAccountId)) continue;
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

  async findById(input: { organizationId: string; tenderId: string; itemId: string }): Promise<ChecklistItem | null> {
    return (
      this.items.find(
        (item) =>
          item.id === input.itemId && item.organizationId === input.organizationId && item.tenderId === input.tenderId,
      ) ?? null
    );
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<ChecklistItem[]> {
    return this.items.filter(
      (item) => item.organizationId === input.organizationId && item.tenderId === input.tenderId,
    );
  }

  async listByTenderIds(input: { organizationId: string; tenderIds: readonly string[] }): Promise<ChecklistItem[]> {
    const allowed = new Set(input.tenderIds);
    return this.items.filter((item) => item.organizationId === input.organizationId && allowed.has(item.tenderId));
  }

  async save(item: ChecklistItem): Promise<void> {
    const index = this.items.findIndex((existing) => existing.id === item.id);
    if (index === -1) {
      this.items.push(item);
    } else {
      this.items[index] = item;
    }
  }
}

export class InMemoryRequestedDocumentRepository implements RequestedDocumentRepository {
  readonly documents: RequestedDocument[] = [];

  async findById(input: {
    organizationId: string;
    tenderId: string;
    documentId: string;
  }): Promise<RequestedDocument | null> {
    return (
      this.documents.find(
        (doc) =>
          doc.id === input.documentId && doc.organizationId === input.organizationId && doc.tenderId === input.tenderId,
      ) ?? null
    );
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<RequestedDocument[]> {
    return this.documents.filter(
      (doc) => doc.organizationId === input.organizationId && doc.tenderId === input.tenderId,
    );
  }

  async listByTenderIds(input: {
    organizationId: string;
    tenderIds: readonly string[];
  }): Promise<RequestedDocument[]> {
    const allowed = new Set(input.tenderIds);
    return this.documents.filter((doc) => doc.organizationId === input.organizationId && allowed.has(doc.tenderId));
  }

  async save(document: RequestedDocument): Promise<void> {
    const index = this.documents.findIndex((existing) => existing.id === document.id);
    if (index === -1) {
      this.documents.push(document);
    } else {
      this.documents[index] = document;
    }
  }

  async delete(input: { organizationId: string; tenderId: string; documentId: string }): Promise<void> {
    const index = this.documents.findIndex(
      (doc) =>
        doc.id === input.documentId && doc.organizationId === input.organizationId && doc.tenderId === input.tenderId,
    );
    if (index !== -1) {
      this.documents.splice(index, 1);
    }
  }
}

export class InMemoryAwardCriterionRepository implements AwardCriterionRepository {
  readonly criteria: AwardCriterion[] = [];

  async findById(input: {
    organizationId: string;
    tenderId: string;
    criterionId: string;
  }): Promise<AwardCriterion | null> {
    return (
      this.criteria.find(
        (criterion) =>
          criterion.id === input.criterionId &&
          criterion.organizationId === input.organizationId &&
          criterion.tenderId === input.tenderId,
      ) ?? null
    );
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<AwardCriterion[]> {
    return this.criteria.filter(
      (criterion) => criterion.organizationId === input.organizationId && criterion.tenderId === input.tenderId,
    );
  }

  async listByTenderIds(input: { organizationId: string; tenderIds: readonly string[] }): Promise<AwardCriterion[]> {
    const allowed = new Set(input.tenderIds);
    return this.criteria.filter(
      (criterion) => criterion.organizationId === input.organizationId && allowed.has(criterion.tenderId),
    );
  }

  async save(criterion: AwardCriterion): Promise<void> {
    const index = this.criteria.findIndex((existing) => existing.id === criterion.id);
    if (index === -1) {
      this.criteria.push(criterion);
    } else {
      this.criteria[index] = criterion;
    }
  }

  async delete(input: { organizationId: string; tenderId: string; criterionId: string }): Promise<void> {
    const index = this.criteria.findIndex(
      (criterion) =>
        criterion.id === input.criterionId &&
        criterion.organizationId === input.organizationId &&
        criterion.tenderId === input.tenderId,
    );
    if (index !== -1) {
      this.criteria.splice(index, 1);
    }
  }
}

/** Reproduit fidèlement le comportement attendu du repository Prisma réel (conception §D, §E) :
 *  findById exclut toujours les lots supprimés, findByIdIncludingDeleted les inclut, save
 *  applique la contrainte d'unicité (tenderId, lotNumber) même pour un lot supprimé. */
export class InMemoryTenderLotRepository implements TenderLotRepository {
  private readonly lots = new Map<string, TenderLot>();

  async seed(lot: TenderLot): Promise<void> {
    this.lots.set(lot.id, lot);
  }

  async findById(input: { organizationId: string; tenderId: string; lotId: string }): Promise<TenderLot | null> {
    const lot = this.lots.get(input.lotId);
    if (
      !lot ||
      lot.organizationId !== input.organizationId ||
      lot.tenderId !== input.tenderId ||
      lot.deletedAt !== undefined
    ) {
      return null;
    }
    return lot;
  }

  async findByIdIncludingDeleted(input: {
    organizationId: string;
    tenderId: string;
    lotId: string;
  }): Promise<TenderLot | null> {
    const lot = this.lots.get(input.lotId);
    if (!lot || lot.organizationId !== input.organizationId || lot.tenderId !== input.tenderId) {
      return null;
    }
    return lot;
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<TenderLot[]> {
    return [...this.lots.values()]
      .filter(
        (lot) => lot.organizationId === input.organizationId && lot.tenderId === input.tenderId && !lot.deletedAt,
      )
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async createAppendedAtEnd(lot: TenderLot): Promise<TenderLot> {
    const activeCount = (await this.listByTender({ organizationId: lot.organizationId, tenderId: lot.tenderId })).length;
    lot.reorder(activeCount, lot.updatedAt);
    await this.save(lot);
    return lot;
  }

  async restoreAppendedAtEnd(input: { lot: TenderLot; occurredAt: Date }): Promise<TenderLot> {
    const activeCount = (
      await this.listByTender({ organizationId: input.lot.organizationId, tenderId: input.lot.tenderId })
    ).length;
    input.lot.restore(activeCount, input.occurredAt);
    await this.save(input.lot);
    return input.lot;
  }

  async save(lot: TenderLot): Promise<void> {
    const duplicate = [...this.lots.values()].find(
      (existing) =>
        existing.id !== lot.id && existing.tenderId === lot.tenderId && existing.lotNumber === lot.lotNumber,
    );
    if (duplicate) {
      throw new DuplicateTenderLotNumberError();
    }
    this.lots.set(lot.id, lot);
  }

  async saveReordered(lots: readonly TenderLot[]): Promise<void> {
    for (const lot of lots) {
      this.lots.set(lot.id, lot);
    }
  }
}

export class InMemoryMilestoneRepository implements MilestoneRepository {
  readonly milestones: Milestone[] = [];

  async findById(input: { organizationId: string; tenderId: string; milestoneId: string }): Promise<Milestone | null> {
    return (
      this.milestones.find(
        (milestone) =>
          milestone.id === input.milestoneId &&
          milestone.organizationId === input.organizationId &&
          milestone.tenderId === input.tenderId,
      ) ?? null
    );
  }

  async listByTender(input: { organizationId: string; tenderId: string }): Promise<Milestone[]> {
    return this.milestones.filter(
      (milestone) => milestone.organizationId === input.organizationId && milestone.tenderId === input.tenderId,
    );
  }

  async listByTenderIds(input: { organizationId: string; tenderIds: readonly string[] }): Promise<Milestone[]> {
    const allowed = new Set(input.tenderIds);
    return this.milestones.filter(
      (milestone) => milestone.organizationId === input.organizationId && allowed.has(milestone.tenderId),
    );
  }

  async save(milestone: Milestone): Promise<void> {
    const index = this.milestones.findIndex((existing) => existing.id === milestone.id);
    if (index === -1) {
      this.milestones.push(milestone);
    } else {
      this.milestones[index] = milestone;
    }
  }

  async delete(input: { organizationId: string; tenderId: string; milestoneId: string }): Promise<void> {
    const index = this.milestones.findIndex(
      (milestone) =>
        milestone.id === input.milestoneId &&
        milestone.organizationId === input.organizationId &&
        milestone.tenderId === input.tenderId,
    );
    if (index !== -1) {
      this.milestones.splice(index, 1);
    }
  }
}
