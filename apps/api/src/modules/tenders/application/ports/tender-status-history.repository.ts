export type TenderStatusHistoryEntry = Readonly<{
  id: string;
  previousStatus: string | null;
  newStatus: string;
  reason: string | null;
  changedBy: string;
  changedAt: string;
}>;

export interface TenderStatusHistoryRepository {
  listByTender(input: { organizationId: string; tenderId: string }): Promise<TenderStatusHistoryEntry[]>;
  append(input: {
    organizationId: string;
    tenderId: string;
    previousStatus: string | null;
    newStatus: string;
    reason?: string | undefined;
    changedBy: string;
    occurredAt: Date;
  }): Promise<void>;
}

export const TENDER_STATUS_HISTORY_REPOSITORY = Symbol("TENDER_STATUS_HISTORY_REPOSITORY");
