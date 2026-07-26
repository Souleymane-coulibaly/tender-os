import type { Alert } from "../domain/alert.entity";
import type { AwardCriterion } from "../domain/award-criterion.entity";
import type { ChecklistItem } from "../domain/checklist-item.entity";
import type { Milestone } from "../domain/milestone.entity";
import type { RequestedDocument } from "../domain/requested-document.entity";
import type { Risk } from "../domain/risk.entity";
import type { Tender } from "../domain/tender.aggregate";
import type { TenderLot } from "../domain/tender-lot.entity";

export type TenderSummary = {
  id: string;
  organizationId: string;
  title: string;
  reference?: string | undefined;
  buyerName?: string | undefined;
  description?: string | undefined;
  publicationDate?: string | undefined;
  submissionDeadline?: string | undefined;
  procedureType?: string | undefined;
  marketType?: string | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
  internalOwnerId?: string | undefined;
  status: string;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | undefined;
  version: number;
};

export function toTenderSummary(tender: Tender): TenderSummary {
  return {
    id: tender.id.value,
    organizationId: tender.organizationId,
    title: tender.title,
    reference: tender.reference,
    buyerName: tender.buyerName,
    description: tender.description,
    publicationDate: tender.publicationDate?.toISOString(),
    submissionDeadline: tender.submissionDeadline?.toISOString(),
    procedureType: tender.procedureType,
    marketType: tender.marketType,
    estimatedAmount: tender.estimatedAmount,
    currency: tender.currency,
    internalOwnerId: tender.internalOwnerId,
    status: tender.status,
    tags: tender.tags,
    createdBy: tender.createdBy,
    createdAt: tender.createdAt.toISOString(),
    updatedAt: tender.updatedAt.toISOString(),
    archivedAt: tender.archivedAt?.toISOString(),
    version: tender.version,
  };
}

export type TenderLotSummary = {
  id: string;
  tenderId: string;
  lotNumber: string;
  title: string;
  description?: string | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export function toTenderLotSummary(lot: TenderLot): TenderLotSummary {
  return {
    id: lot.id,
    tenderId: lot.tenderId,
    lotNumber: lot.lotNumber,
    title: lot.title,
    description: lot.description,
    estimatedAmount: lot.estimatedAmount,
    currency: lot.currency,
    createdAt: lot.createdAt.toISOString(),
    updatedAt: lot.updatedAt.toISOString(),
  };
}

export type ChecklistItemSummary = {
  id: string;
  tenderId: string;
  title: string;
  description?: string | undefined;
  required: boolean;
  status: string;
  assignedTo?: string | undefined;
  dueDate?: string | undefined;
  comment?: string | undefined;
  completedAt?: string | undefined;
  completedBy?: string | undefined;
  displayOrder: number;
};

export function toChecklistItemSummary(item: ChecklistItem): ChecklistItemSummary {
  return {
    id: item.id,
    tenderId: item.tenderId,
    title: item.title,
    description: item.description,
    required: item.required,
    status: item.status,
    assignedTo: item.assignedTo,
    dueDate: item.dueDate?.toISOString(),
    comment: item.comment,
    completedAt: item.completedAt?.toISOString(),
    completedBy: item.completedBy,
    displayOrder: item.displayOrder,
  };
}

export type AwardCriterionSummary = {
  id: string;
  tenderId: string;
  name: string;
  description?: string | undefined;
  weight: string;
  parentCriterionId?: string | undefined;
  displayOrder: number;
};

export function toAwardCriterionSummary(criterion: AwardCriterion): AwardCriterionSummary {
  return {
    id: criterion.id,
    tenderId: criterion.tenderId,
    name: criterion.name,
    description: criterion.description,
    weight: criterion.weight,
    parentCriterionId: criterion.parentCriterionId,
    displayOrder: criterion.displayOrder,
  };
}

export type RequestedDocumentSummary = {
  id: string;
  tenderId: string;
  name: string;
  category?: string | undefined;
  documentType?: string | undefined;
  required: boolean;
  description?: string | undefined;
  expirationDate?: string | undefined;
  status: string;
  documentId?: string | undefined;
  displayOrder: number;
};

export function toRequestedDocumentSummary(document: RequestedDocument): RequestedDocumentSummary {
  return {
    id: document.id,
    tenderId: document.tenderId,
    name: document.name,
    category: document.category,
    documentType: document.documentType,
    required: document.required,
    description: document.description,
    expirationDate: document.expirationDate?.toISOString(),
    status: document.status,
    documentId: document.documentId,
    displayOrder: document.displayOrder,
  };
}

export type MilestoneSummary = {
  id: string;
  tenderId: string;
  title: string;
  description?: string | undefined;
  date: string;
  type: string;
  status: string;
  responsibleUserId?: string | undefined;
  overdue: boolean;
};

export function toMilestoneSummary(milestone: Milestone, now: Date): MilestoneSummary {
  return {
    id: milestone.id,
    tenderId: milestone.tenderId,
    title: milestone.title,
    description: milestone.description,
    date: milestone.date.toISOString(),
    type: milestone.type,
    status: milestone.status,
    responsibleUserId: milestone.responsibleUserId,
    overdue: milestone.isOverdue(now),
  };
}

export type RiskSummary = {
  id: string;
  tenderId: string;
  title: string;
  description?: string | undefined;
  severity: string;
  source?: string | undefined;
  status: string;
  mitigation?: string | undefined;
  assignedTo?: string | undefined;
  resolvedAt?: string | undefined;
};

export function toRiskSummary(risk: Risk): RiskSummary {
  return {
    id: risk.id,
    tenderId: risk.tenderId,
    title: risk.title,
    description: risk.description,
    severity: risk.severity,
    source: risk.source,
    status: risk.status,
    mitigation: risk.mitigation,
    assignedTo: risk.assignedTo,
    resolvedAt: risk.resolvedAt?.toISOString(),
  };
}

export type AlertSummary = {
  id: string;
  tenderId: string;
  type: string;
  severity: string;
  message: string;
  source?: string | undefined;
  resolved: boolean;
  resolvedAt?: string | undefined;
  resolvedBy?: string | undefined;
  createdAt: string;
};

export function toAlertSummary(alert: Alert): AlertSummary {
  return {
    id: alert.id,
    tenderId: alert.tenderId,
    type: alert.type,
    severity: alert.severity,
    message: alert.message,
    source: alert.source,
    resolved: alert.resolved,
    resolvedAt: alert.resolvedAt?.toISOString(),
    resolvedBy: alert.resolvedBy,
    createdAt: alert.createdAt.toISOString(),
  };
}
