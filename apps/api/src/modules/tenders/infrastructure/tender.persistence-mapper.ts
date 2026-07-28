import type { Tender as TenderRecord } from "@prisma/client";
import { Tender } from "../domain/tender.aggregate";
import { TenderId } from "../domain/tender-id.value-object";
import type { TenderStatus } from "../domain/tender-status";
import type { MarketType } from "../domain/market-type";
import type { TenderCountry } from "../domain/tender-country";
import type { TenderLanguage } from "../domain/tender-language";
import type { TenderSource } from "../domain/tender-source";

export type TenderPersistenceData = {
  id: string;
  organizationId: string;
  title: string;
  reference: string | null;
  buyerName: string | null;
  description: string | null;
  publicationDate: Date | null;
  submissionDeadline: Date | null;
  procedureType: string | null;
  marketType: string | null;
  country: string | null;
  language: string | null;
  source: string | null;
  externalReference: string | null;
  sourceUrl: string | null;
  estimatedAmount: string | null;
  currency: string | null;
  internalOwnerId: string | null;
  status: string;
  tags: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  version: number;
};

export class TenderPersistenceMapper {
  toDomain(record: TenderRecord): Tender {
    return Tender.rehydrate({
      id: TenderId.from(record.id),
      organizationId: record.organizationId,
      title: record.title,
      reference: record.reference ?? undefined,
      buyerName: record.buyerName ?? undefined,
      description: record.description ?? undefined,
      publicationDate: record.publicationDate ?? undefined,
      submissionDeadline: record.submissionDeadline ?? undefined,
      procedureType: record.procedureType ?? undefined,
      marketType: (record.marketType as MarketType | null) ?? undefined,
      country: (record.country as TenderCountry | null) ?? undefined,
      language: (record.language as TenderLanguage | null) ?? undefined,
      source: (record.source as TenderSource | null) ?? undefined,
      externalReference: record.externalReference ?? undefined,
      sourceUrl: record.sourceUrl ?? undefined,
      estimatedAmount: record.estimatedAmount?.toString(),
      currency: record.currency ?? undefined,
      internalOwnerId: record.internalOwnerId ?? undefined,
      status: record.status as TenderStatus,
      tags: record.tags,
      createdBy: record.createdBy,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      archivedAt: record.archivedAt ?? undefined,
      version: record.version,
    });
  }

  toPersistence(tender: Tender): TenderPersistenceData {
    return {
      id: tender.id.value,
      organizationId: tender.organizationId,
      title: tender.title,
      reference: tender.reference ?? null,
      buyerName: tender.buyerName ?? null,
      description: tender.description ?? null,
      publicationDate: tender.publicationDate ?? null,
      submissionDeadline: tender.submissionDeadline ?? null,
      procedureType: tender.procedureType ?? null,
      marketType: tender.marketType ?? null,
      country: tender.country ?? null,
      language: tender.language ?? null,
      source: tender.source ?? null,
      externalReference: tender.externalReference ?? null,
      sourceUrl: tender.sourceUrl ?? null,
      estimatedAmount: tender.estimatedAmount ?? null,
      currency: tender.currency ?? null,
      internalOwnerId: tender.internalOwnerId ?? null,
      status: tender.status,
      tags: tender.tags,
      createdBy: tender.createdBy,
      createdAt: tender.createdAt,
      updatedAt: tender.updatedAt,
      archivedAt: tender.archivedAt ?? null,
      version: tender.version,
    };
  }
}
