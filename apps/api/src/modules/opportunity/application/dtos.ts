import type { Opportunity } from "../domain/opportunity.aggregate";

export type OpportunitySummary = {
  id: string;
  organizationId: string;
  clientAccountId?: string | undefined;
  buyerId?: string | undefined;
  title: string;
  description?: string | undefined;
  source: string;
  externalReference?: string | undefined;
  buyerName?: string | undefined;
  sector?: string | undefined;
  cpvCode?: string | undefined;
  location?: string | undefined;
  geographicZone?: string | undefined;
  publicationDate?: string | undefined;
  submissionDeadline?: string | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
  procedureType?: string | undefined;
  status: string;
  tenderId?: string | undefined;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | undefined;
  version: number;
};

export function toOpportunitySummary(opportunity: Opportunity): OpportunitySummary {
  return {
    id: opportunity.id.value,
    organizationId: opportunity.organizationId,
    clientAccountId: opportunity.clientAccountId,
    buyerId: opportunity.buyerId,
    title: opportunity.title,
    description: opportunity.description,
    source: opportunity.source,
    externalReference: opportunity.externalReference,
    buyerName: opportunity.buyerName,
    sector: opportunity.sector,
    cpvCode: opportunity.cpvCode,
    location: opportunity.location,
    geographicZone: opportunity.geographicZone,
    publicationDate: opportunity.publicationDate?.toISOString(),
    submissionDeadline: opportunity.submissionDeadline?.toISOString(),
    estimatedAmount: opportunity.estimatedAmount,
    currency: opportunity.currency,
    procedureType: opportunity.procedureType,
    status: opportunity.status,
    tenderId: opportunity.tenderId,
    createdBy: opportunity.createdBy,
    createdAt: opportunity.createdAt.toISOString(),
    updatedAt: opportunity.updatedAt.toISOString(),
    archivedAt: opportunity.archivedAt?.toISOString(),
    version: opportunity.version,
  };
}
