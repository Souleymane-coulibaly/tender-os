import type { ReadinessStatus } from "../domain/readiness-status";
import type { TenderStatus } from "../domain/tender-status";
import type { Tender } from "../domain/tender.aggregate";
import type { TenderEnrichment } from "./tender-enrichment";

/**
 * DTOs de la vue Kanban & Liste — jamais l'agrégat Tender exposé directement (même
 * convention que dtos.ts). Un même "item" enrichi sert de base au Board et à la Liste ;
 * le Board l'organise en colonnes, la Liste le pagine à plat.
 */
export type TenderBoardItemDto = Readonly<{
  id: string;
  clientAccountId: string;
  title: string;
  reference?: string | undefined;
  buyerName?: string | undefined;
  submissionDeadline?: string | undefined;
  internalOwnerId?: string | undefined;
  status: TenderStatus;
  readinessScore: number;
  readinessStatus: ReadinessStatus;
  openRisksCount: number;
  incompleteChecklistCount: number;
  overdue: boolean;
  updatedAt: string;
}>;

export type TenderListItemDto = TenderBoardItemDto & Readonly<{ createdAt: string; version: number }>;

export function toTenderBoardItemDto(tender: Tender, enrichment: TenderEnrichment): TenderBoardItemDto {
  return {
    id: tender.id.value,
    clientAccountId: tender.clientAccountId,
    title: tender.title,
    reference: tender.reference,
    buyerName: tender.buyerName,
    submissionDeadline: tender.submissionDeadline?.toISOString(),
    internalOwnerId: tender.internalOwnerId,
    status: tender.status,
    readinessScore: enrichment.readiness.score,
    readinessStatus: enrichment.readiness.status,
    openRisksCount: enrichment.openRisksCount,
    incompleteChecklistCount: enrichment.incompleteChecklistCount,
    overdue: enrichment.overdue,
    updatedAt: tender.updatedAt.toISOString(),
  };
}

export function toTenderListItemDto(tender: Tender, enrichment: TenderEnrichment): TenderListItemDto {
  return {
    ...toTenderBoardItemDto(tender, enrichment),
    createdAt: tender.createdAt.toISOString(),
    version: tender.version,
  };
}

export type TenderBoardColumnDto = Readonly<{
  status: TenderStatus;
  totalCount: number;
  items: readonly TenderBoardItemDto[];
}>;

export type TenderBoardDto = Readonly<{ columns: readonly TenderBoardColumnDto[] }>;

export type TenderStatisticsDto = Readonly<{
  totalActive: number;
  byStatus: Readonly<Record<string, number>>;
  deadlinesNext7Days: number;
  overdueCount: number;
  readyToSubmitCount: number;
  atRiskCount: number;
  averageReadinessScore: number;
}>;
