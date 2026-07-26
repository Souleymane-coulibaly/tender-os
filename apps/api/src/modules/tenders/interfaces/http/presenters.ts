import type {
  AlertSummary,
  AwardCriterionSummary,
  ChecklistItemSummary,
  MilestoneSummary,
  RequestedDocumentSummary,
  RiskSummary,
  TenderLotSummary,
  TenderSummary,
} from "../../application/dtos";
import type { TenderBoardDto, TenderListItemDto, TenderStatisticsDto } from "../../application/board-dtos";
import type { ReadinessResult } from "../../domain/readiness-calculator";
import type { TenderStatusHistoryEntry } from "../../application/ports/tender-status-history.repository";

export type PageResponse<T> = Readonly<{
  items: readonly T[];
  pageInfo: Readonly<{ hasNextPage: boolean; nextCursor: string | null }>;
}>;

export function presentPage<T>(items: readonly T[], nextCursor: string | null): PageResponse<T> {
  return { items, pageInfo: { hasNextPage: nextCursor !== null, nextCursor } };
}

// Point de contrôle explicite des champs exposés — chaque presenter reste un passe-plat
// volontaire ici (le Summary applicatif ne porte déjà aucun champ sensible).
export function presentTender(tender: TenderSummary): TenderSummary {
  return { ...tender };
}
export function presentTenderLot(lot: TenderLotSummary): TenderLotSummary {
  return { ...lot };
}
export function presentChecklistItem(item: ChecklistItemSummary): ChecklistItemSummary {
  return { ...item };
}
export function presentAwardCriterion(criterion: AwardCriterionSummary): AwardCriterionSummary {
  return { ...criterion };
}
export function presentRequestedDocument(document: RequestedDocumentSummary): RequestedDocumentSummary {
  return { ...document };
}
export function presentMilestone(milestone: MilestoneSummary): MilestoneSummary {
  return { ...milestone };
}
export function presentRisk(risk: RiskSummary): RiskSummary {
  return { ...risk };
}
export function presentAlert(alert: AlertSummary): AlertSummary {
  return { ...alert };
}
export function presentStatusHistoryEntry(entry: TenderStatusHistoryEntry): TenderStatusHistoryEntry {
  return { ...entry };
}

export type ReadinessResponse = ReadinessResult & Readonly<{ disclaimer: string }>;

export function presentReadiness(result: ReadinessResult): ReadinessResponse {
  return {
    ...result,
    disclaimer: "Ce score est un indicateur interne, pas une garantie de conformité juridique ou contractuelle.",
  };
}

export function presentTenderBoard(board: TenderBoardDto): TenderBoardDto {
  return board;
}
export function presentTenderListItem(item: TenderListItemDto): TenderListItemDto {
  return { ...item };
}

export type TenderStatisticsResponse = TenderStatisticsDto & Readonly<{ disclaimer: string }>;

export function presentTenderStatistics(stats: TenderStatisticsDto): TenderStatisticsResponse {
  return {
    ...stats,
    disclaimer: "Le score de préparation moyen reste un indicateur interne, pas une garantie de conformité.",
  };
}
