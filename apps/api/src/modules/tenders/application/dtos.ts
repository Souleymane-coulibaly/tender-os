import type { Alert } from "../domain/alert.entity";
import type { AwardCriterion } from "../domain/award-criterion.entity";
import type { Buyer } from "../domain/buyer.entity";
import type { ChecklistItem } from "../domain/checklist-item.entity";
import type { Milestone } from "../domain/milestone.entity";
import type { Risk } from "../domain/risk.entity";
import type { Tender } from "../domain/tender.aggregate";
import type { TenderLot } from "../domain/tender-lot.entity";

export type TenderSummary = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  candidateCompanyId?: string | undefined;
  title: string;
  reference?: string | undefined;
  buyerName?: string | undefined;
  buyerId?: string | undefined;
  description?: string | undefined;
  publicationDate?: string | undefined;
  submissionDeadline?: string | undefined;
  submissionDeadlineTimezone?: string | undefined;
  questionsDeadline?: string | undefined;
  visitDate?: string | undefined;
  visitMandatory?: boolean | undefined;
  contractDurationMonths?: number | undefined;
  renewalDurationMonths?: number | undefined;
  renewalCount?: number | undefined;
  estimatedStartDate?: string | undefined;
  executionLocation?: string | undefined;
  geographicZone?: string | undefined;
  isFrameworkAgreement?: boolean | undefined;
  awardType?: string | undefined;
  variantsAllowed?: boolean | undefined;
  pseAllowed?: boolean | undefined;
  electronicResponseMandatory?: boolean | undefined;
  signatureRequired?: boolean | undefined;
  submissionPlatformUrl?: string | undefined;
  internalNotes?: string | undefined;
  procedureType?: string | undefined;
  marketType?: string | undefined;
  country?: string | undefined;
  language?: string | undefined;
  source?: string | undefined;
  externalReference?: string | undefined;
  sourceUrl?: string | undefined;
  estimatedAmount?: string | undefined;
  minimumAmount?: string | undefined;
  maximumAmount?: string | undefined;
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
    clientAccountId: tender.clientAccountId,
    candidateCompanyId: tender.candidateCompanyId,
    title: tender.title,
    reference: tender.reference,
    buyerName: tender.buyerName,
    buyerId: tender.buyerId,
    description: tender.description,
    publicationDate: tender.publicationDate?.toISOString(),
    submissionDeadline: tender.submissionDeadline?.toISOString(),
    submissionDeadlineTimezone: tender.submissionDeadlineTimezone,
    questionsDeadline: tender.questionsDeadline?.toISOString(),
    visitDate: tender.visitDate?.toISOString(),
    visitMandatory: tender.visitMandatory,
    contractDurationMonths: tender.contractDurationMonths,
    renewalDurationMonths: tender.renewalDurationMonths,
    renewalCount: tender.renewalCount,
    estimatedStartDate: tender.estimatedStartDate?.toISOString(),
    executionLocation: tender.executionLocation,
    geographicZone: tender.geographicZone,
    isFrameworkAgreement: tender.isFrameworkAgreement,
    awardType: tender.awardType,
    variantsAllowed: tender.variantsAllowed,
    pseAllowed: tender.pseAllowed,
    electronicResponseMandatory: tender.electronicResponseMandatory,
    signatureRequired: tender.signatureRequired,
    submissionPlatformUrl: tender.submissionPlatformUrl,
    internalNotes: tender.internalNotes,
    procedureType: tender.procedureType,
    marketType: tender.marketType,
    country: tender.country,
    language: tender.language,
    source: tender.source,
    externalReference: tender.externalReference,
    sourceUrl: tender.sourceUrl,
    estimatedAmount: tender.estimatedAmount,
    minimumAmount: tender.minimumAmount,
    maximumAmount: tender.maximumAmount,
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

export type BuyerSummary = {
  id: string;
  organizationId: string;
  name: string;
  legalName?: string | undefined;
  identifier?: string | undefined;
  siret?: string | undefined;
  addressLine?: string | undefined;
  postalCode?: string | undefined;
  city?: string | undefined;
  country?: string | undefined;
  buyerType?: string | undefined;
  contactName?: string | undefined;
  contactEmail?: string | undefined;
  contactPhone?: string | undefined;
  profileUrl?: string | undefined;
  notes?: string | undefined;
  archivedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export function toBuyerSummary(buyer: Buyer): BuyerSummary {
  return {
    id: buyer.id,
    organizationId: buyer.organizationId,
    name: buyer.name,
    legalName: buyer.legalName,
    identifier: buyer.identifier,
    siret: buyer.siret,
    addressLine: buyer.addressLine,
    postalCode: buyer.postalCode,
    city: buyer.city,
    country: buyer.country,
    buyerType: buyer.buyerType,
    contactName: buyer.contactName,
    contactEmail: buyer.contactEmail,
    contactPhone: buyer.contactPhone,
    profileUrl: buyer.profileUrl,
    notes: buyer.notes,
    archivedAt: buyer.archivedAt?.toISOString(),
    createdAt: buyer.createdAt.toISOString(),
    updatedAt: buyer.updatedAt.toISOString(),
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
  displayOrder: number;
  code?: string | undefined;
  cpvMain?: string | undefined;
  cpvSecondary: string[];
  executionLocation?: string | undefined;
  durationMonths?: number | undefined;
  estimatedStartDate?: string | undefined;
  minimumAmount?: string | undefined;
  maximumAmount?: string | undefined;
  selectedForResponse: boolean;
  soloAllowed: boolean;
  groupAllowed: boolean;
  variantsAllowed?: boolean | undefined;
  pseAllowed?: boolean | undefined;
  specificVisitRequired?: boolean | undefined;
  specificVisitDate?: string | undefined;
  internalNotes?: string | undefined;
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
    displayOrder: lot.displayOrder,
    code: lot.code,
    cpvMain: lot.cpvMain,
    cpvSecondary: lot.cpvSecondary,
    executionLocation: lot.executionLocation,
    durationMonths: lot.durationMonths,
    estimatedStartDate: lot.estimatedStartDate?.toISOString(),
    minimumAmount: lot.minimumAmount,
    maximumAmount: lot.maximumAmount,
    selectedForResponse: lot.selectedForResponse,
    soloAllowed: lot.soloAllowed,
    groupAllowed: lot.groupAllowed,
    variantsAllowed: lot.variantsAllowed,
    pseAllowed: lot.pseAllowed,
    specificVisitRequired: lot.specificVisitRequired,
    specificVisitDate: lot.specificVisitDate?.toISOString(),
    internalNotes: lot.internalNotes,
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
  type: string;
  requirementLevel: string;
  conditionText?: string | undefined;
  criticality: string;
  complianceStatus: string;
  documentStatus: string;
  origin: string;
  subjectType: string;
  subjectSubcontractorProfileId?: string | undefined;
  lotId?: string | undefined;
  matchedDocumentId?: string | undefined;
  matchedDocumentVersionId?: string | undefined;
  documentMatchStatus: string;
  documentMatchScore?: number | undefined;
  documentMatchReasons?: readonly string[] | undefined;
  documentExpiresAt?: string | undefined;
  documentValidityCheckedAt?: string | undefined;
  requirementFreshness: string;
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
    type: item.type,
    requirementLevel: item.requirementLevel,
    conditionText: item.conditionText,
    criticality: item.criticality,
    complianceStatus: item.complianceStatus,
    documentStatus: item.documentStatus,
    origin: item.origin,
    subjectType: item.subjectType,
    subjectSubcontractorProfileId: item.subjectSubcontractorProfileId,
    lotId: item.lotId,
    matchedDocumentId: item.matchedDocumentId,
    matchedDocumentVersionId: item.matchedDocumentVersionId,
    documentMatchStatus: item.documentMatchStatus,
    documentMatchScore: item.documentMatchScore,
    documentMatchReasons: item.documentMatchReasons,
    documentExpiresAt: item.documentExpiresAt?.toISOString(),
    documentValidityCheckedAt: item.documentValidityCheckedAt?.toISOString(),
    requirementFreshness: item.requirementFreshness,
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
  lotId?: string | undefined;
  type?: string | undefined;
  scoringMethod?: string | undefined;
  eliminationThreshold?: string | undefined;
  status: string;
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
    lotId: criterion.lotId,
    type: criterion.type,
    scoringMethod: criterion.scoringMethod,
    eliminationThreshold: criterion.eliminationThreshold,
    status: criterion.status,
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
  timezone?: string | undefined;
  lotId?: string | undefined;
  mandatory: boolean;
  completedAt?: string | undefined;
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
    timezone: milestone.timezone,
    lotId: milestone.lotId,
    mandatory: milestone.mandatory,
    completedAt: milestone.completedAt?.toISOString(),
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
  category?: string | undefined;
  probability?: string | undefined;
  impact?: string | undefined;
  lotId?: string | undefined;
  origin: string;
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
    category: risk.category,
    probability: risk.probability,
    impact: risk.impact,
    lotId: risk.lotId,
    origin: risk.origin,
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
