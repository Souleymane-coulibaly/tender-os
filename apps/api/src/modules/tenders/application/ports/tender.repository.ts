import type { Tender } from "../../domain/tender.aggregate";
import type { TenderStatus } from "../../domain/tender-status";

export type TenderPage = { items: Tender[]; nextCursor: string | null };

export interface TenderRepository {
  findById(input: { organizationId: string; tenderId: string }): Promise<Tender | null>;
  list(input: {
    organizationId: string;
    cursor?: string | undefined;
    limit: number;
    status?: TenderStatus | undefined;
    internalOwnerId?: string | undefined;
    search?: string | undefined;
    deadlineBefore?: Date | undefined;
    sort?: "createdAt" | "submissionDeadline" | "title" | undefined;
    sortDirection?: "asc" | "desc" | undefined;
  }): Promise<TenderPage>;
  save(tender: Tender): Promise<void>;
}

export const TENDER_REPOSITORY = Symbol("TENDER_REPOSITORY");
