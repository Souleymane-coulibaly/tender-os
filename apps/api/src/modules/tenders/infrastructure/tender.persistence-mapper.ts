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
  clientAccountId: string;
  title: string;
  reference: string | null;
  buyerName: string | null;
  buyerId: string | null;
  description: string | null;
  publicationDate: Date | null;
  submissionDeadline: Date | null;
  submissionDeadlineTimezone: string | null;
  questionsDeadline: Date | null;
  visitDate: Date | null;
  visitMandatory: boolean | null;
  contractDurationMonths: number | null;
  renewalDurationMonths: number | null;
  renewalCount: number | null;
  estimatedStartDate: Date | null;
  executionLocation: string | null;
  geographicZone: string | null;
  isFrameworkAgreement: boolean | null;
  awardType: string | null;
  variantsAllowed: boolean | null;
  pseAllowed: boolean | null;
  electronicResponseMandatory: boolean | null;
  signatureRequired: boolean | null;
  submissionPlatformUrl: string | null;
  internalNotes: string | null;
  procedureType: string | null;
  marketType: string | null;
  country: string | null;
  language: string | null;
  source: string | null;
  externalReference: string | null;
  sourceUrl: string | null;
  estimatedAmount: string | null;
  minimumAmount: string | null;
  maximumAmount: string | null;
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
      clientAccountId: record.clientAccountId,
      title: record.title,
      reference: record.reference ?? undefined,
      buyerName: record.buyerName ?? undefined,
      buyerId: record.buyerId ?? undefined,
      description: record.description ?? undefined,
      publicationDate: record.publicationDate ?? undefined,
      submissionDeadline: record.submissionDeadline ?? undefined,
      submissionDeadlineTimezone: record.submissionDeadlineTimezone ?? undefined,
      questionsDeadline: record.questionsDeadline ?? undefined,
      visitDate: record.visitDate ?? undefined,
      visitMandatory: record.visitMandatory ?? undefined,
      contractDurationMonths: record.contractDurationMonths ?? undefined,
      renewalDurationMonths: record.renewalDurationMonths ?? undefined,
      renewalCount: record.renewalCount ?? undefined,
      estimatedStartDate: record.estimatedStartDate ?? undefined,
      executionLocation: record.executionLocation ?? undefined,
      geographicZone: record.geographicZone ?? undefined,
      isFrameworkAgreement: record.isFrameworkAgreement ?? undefined,
      awardType: record.awardType ?? undefined,
      variantsAllowed: record.variantsAllowed ?? undefined,
      pseAllowed: record.pseAllowed ?? undefined,
      electronicResponseMandatory: record.electronicResponseMandatory ?? undefined,
      signatureRequired: record.signatureRequired ?? undefined,
      submissionPlatformUrl: record.submissionPlatformUrl ?? undefined,
      internalNotes: record.internalNotes ?? undefined,
      procedureType: record.procedureType ?? undefined,
      marketType: (record.marketType as MarketType | null) ?? undefined,
      country: (record.country as TenderCountry | null) ?? undefined,
      language: (record.language as TenderLanguage | null) ?? undefined,
      source: (record.source as TenderSource | null) ?? undefined,
      externalReference: record.externalReference ?? undefined,
      sourceUrl: record.sourceUrl ?? undefined,
      estimatedAmount: record.estimatedAmount?.toString(),
      minimumAmount: record.minimumAmount?.toString(),
      maximumAmount: record.maximumAmount?.toString(),
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
      clientAccountId: tender.clientAccountId,
      title: tender.title,
      reference: tender.reference ?? null,
      buyerName: tender.buyerName ?? null,
      buyerId: tender.buyerId ?? null,
      description: tender.description ?? null,
      publicationDate: tender.publicationDate ?? null,
      submissionDeadline: tender.submissionDeadline ?? null,
      submissionDeadlineTimezone: tender.submissionDeadlineTimezone ?? null,
      questionsDeadline: tender.questionsDeadline ?? null,
      visitDate: tender.visitDate ?? null,
      visitMandatory: tender.visitMandatory ?? null,
      contractDurationMonths: tender.contractDurationMonths ?? null,
      renewalDurationMonths: tender.renewalDurationMonths ?? null,
      renewalCount: tender.renewalCount ?? null,
      estimatedStartDate: tender.estimatedStartDate ?? null,
      executionLocation: tender.executionLocation ?? null,
      geographicZone: tender.geographicZone ?? null,
      isFrameworkAgreement: tender.isFrameworkAgreement ?? null,
      awardType: tender.awardType ?? null,
      variantsAllowed: tender.variantsAllowed ?? null,
      pseAllowed: tender.pseAllowed ?? null,
      electronicResponseMandatory: tender.electronicResponseMandatory ?? null,
      signatureRequired: tender.signatureRequired ?? null,
      submissionPlatformUrl: tender.submissionPlatformUrl ?? null,
      internalNotes: tender.internalNotes ?? null,
      procedureType: tender.procedureType ?? null,
      marketType: tender.marketType ?? null,
      country: tender.country ?? null,
      language: tender.language ?? null,
      source: tender.source ?? null,
      externalReference: tender.externalReference ?? null,
      sourceUrl: tender.sourceUrl ?? null,
      estimatedAmount: tender.estimatedAmount ?? null,
      minimumAmount: tender.minimumAmount ?? null,
      maximumAmount: tender.maximumAmount ?? null,
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
