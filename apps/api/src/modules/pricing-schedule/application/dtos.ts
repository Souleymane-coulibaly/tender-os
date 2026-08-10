import type { PricingScheduleFinalFile } from "../domain/pricing-schedule-final-file.value-object";
import type { PricingScheduleLine } from "../domain/pricing-schedule-line.entity";
import type { PricingScheduleVersion } from "../domain/pricing-schedule-version.entity";
import type { PricingSchedule } from "../domain/pricing-schedule.aggregate";

/**
 * Les agrégats/entités du domaine exposent leur état via des GETTERS de prototype — `JSON.stringify`
 * ne sérialise jamais les accesseurs hérités, seulement les propriétés propres énumérables. Chaque
 * type retourné par une route HTTP passe donc par un mapper explicite vers un objet littéral plat,
 * jamais l'instance de classe elle-même (même motif que `technical-memo/application/dtos.ts`,
 * Sprint 12 — bug de sérialisation déjà rencontré et corrigé une première fois).
 */

export type PricingScheduleSummary = Readonly<{
  id: string;
  organizationId: string;
  tenderId: string;
  lotId?: string | undefined;
  clientAccountId: string;
  financialDocumentType: string;
  sourceDocumentId: string;
  sourceDocumentVersionId: string;
  status: string;
  currentVersionId?: string | undefined;
  currentVersionNumber: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}>;

export function toPricingScheduleSummary(schedule: PricingSchedule): PricingScheduleSummary {
  return {
    id: schedule.id,
    organizationId: schedule.organizationId,
    tenderId: schedule.tenderId,
    lotId: schedule.lotId,
    clientAccountId: schedule.clientAccountId,
    financialDocumentType: schedule.financialDocumentType,
    sourceDocumentId: schedule.sourceDocumentId,
    sourceDocumentVersionId: schedule.sourceDocumentVersionId,
    status: schedule.status,
    currentVersionId: schedule.currentVersionId,
    currentVersionNumber: schedule.currentVersionNumber,
    createdBy: schedule.createdBy,
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
  };
}

export type PricingScheduleVersionSummary = Readonly<{
  id: string;
  organizationId: string;
  pricingScheduleId: string;
  versionNumber: number;
  status: string;
  sourceDocumentVersionId: string;
  mappingVersion: number;
  createdBy: string;
  createdAt: string;
  validatedBy?: string | undefined;
  validatedAt?: string | undefined;
}>;

export function toPricingScheduleVersionSummary(version: PricingScheduleVersion): PricingScheduleVersionSummary {
  return {
    id: version.id,
    organizationId: version.organizationId,
    pricingScheduleId: version.pricingScheduleId,
    versionNumber: version.versionNumber,
    status: version.status,
    sourceDocumentVersionId: version.sourceDocumentVersionId,
    mappingVersion: version.mappingVersion,
    createdBy: version.createdBy,
    createdAt: version.createdAt.toISOString(),
    validatedBy: version.validatedBy,
    validatedAt: version.validatedAt?.toISOString(),
  };
}

export type PricingScheduleLineSummary = Readonly<{
  id: string;
  organizationId: string;
  pricingScheduleVersionId: string;
  sheetName: string;
  rowNumber: number;
  kind: string;
  hierarchyLevel: number;
  parentLineId?: string | undefined;
  designation: string;
  unit?: string | undefined;
  quantity?: string | undefined;
  designationCellRef?: string | undefined;
  quantityCellRef?: string | undefined;
  buyerUnitPriceCellRef?: string | undefined;
  buyerTotalCellRef?: string | undefined;
  proposedUnitPrice?: string | undefined;
  proposedTotal?: string | undefined;
  currencyCode: string;
  costBreakdown?: Record<string, unknown> | undefined;
  candidateComment?: string | undefined;
  status: string;
  matchingKey?: string | undefined;
  createdAt: string;
  updatedAt: string;
}>;

export function toPricingScheduleLineSummary(line: PricingScheduleLine): PricingScheduleLineSummary {
  return {
    id: line.id,
    organizationId: line.organizationId,
    pricingScheduleVersionId: line.pricingScheduleVersionId,
    sheetName: line.sheetName,
    rowNumber: line.rowNumber,
    kind: line.kind,
    hierarchyLevel: line.hierarchyLevel,
    parentLineId: line.parentLineId,
    designation: line.designation,
    unit: line.unit,
    quantity: line.quantity,
    designationCellRef: line.designationCellRef,
    quantityCellRef: line.quantityCellRef,
    buyerUnitPriceCellRef: line.buyerUnitPriceCellRef,
    buyerTotalCellRef: line.buyerTotalCellRef,
    proposedUnitPrice: line.proposedUnitPrice,
    proposedTotal: line.proposedTotal,
    currencyCode: line.currencyCode,
    costBreakdown: line.costBreakdown,
    candidateComment: line.candidateComment,
    status: line.status,
    matchingKey: line.matchingKey,
    createdAt: line.createdAt.toISOString(),
    updatedAt: line.updatedAt.toISOString(),
  };
}

export type PricingScheduleFinalFileSummary = Readonly<{
  id: string;
  organizationId: string;
  pricingScheduleVersionId: string;
  documentId: string;
  documentVersionId: string;
  injectedCellCount: number;
  generatedBy: string;
  generatedAt: string;
}>;

export function toPricingScheduleFinalFileSummary(finalFile: PricingScheduleFinalFile): PricingScheduleFinalFileSummary {
  return {
    id: finalFile.id,
    organizationId: finalFile.organizationId,
    pricingScheduleVersionId: finalFile.pricingScheduleVersionId,
    documentId: finalFile.documentId,
    documentVersionId: finalFile.documentVersionId,
    injectedCellCount: finalFile.injectedCellCount,
    generatedBy: finalFile.generatedBy,
    generatedAt: finalFile.generatedAt.toISOString(),
  };
}
