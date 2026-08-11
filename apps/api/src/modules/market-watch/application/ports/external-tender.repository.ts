import type { ExternalTender } from "../../domain/external-tender.entity";

export type ExternalTenderListFilter = Readonly<{
  organizationId: string;
  keywords?: readonly string[] | undefined;
  cpvCodes?: readonly string[] | undefined;
  countries?: readonly string[] | undefined;
  regions?: readonly string[] | undefined;
  departments?: readonly string[] | undefined;
  sources?: readonly string[] | undefined;
  marketTypes?: readonly string[] | undefined;
  minAmount?: number | undefined;
  maxAmount?: number | undefined;
  publishedAfter?: Date | undefined;
  deadlineBefore?: Date | undefined;
  cursor?: string | undefined;
  limit: number;
  sort?: "relevance" | "deadline" | "publicationDate" | "amount" | undefined;
}>;

export type ExternalTenderPage = Readonly<{ items: ExternalTender[]; nextCursor: string | null }>;

export interface ExternalTenderRepository {
  create(tender: ExternalTender): Promise<void>;
  save(tender: ExternalTender): Promise<void>;
  findBySourceAndExternalId(input: { organizationId: string; source: string; externalId: string }): Promise<ExternalTender | null>;
  findById(input: { organizationId: string; externalTenderId: string }): Promise<ExternalTender | null>;
  findManyByIds(input: { organizationId: string; externalTenderIds: readonly string[] }): Promise<ExternalTender[]>;
  list(filter: ExternalTenderListFilter): Promise<ExternalTenderPage>;
}

export const EXTERNAL_TENDER_REPOSITORY = Symbol("EXTERNAL_TENDER_REPOSITORY");
