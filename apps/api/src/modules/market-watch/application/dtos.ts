import type { ExternalTender } from "../domain/external-tender.entity";
import type { SavedSearch } from "../domain/saved-search.entity";
import type { SavedSearchMatch } from "../domain/saved-search-match.entity";

export type SavedSearchSummary = Readonly<{
  id: string;
  ownerUserId: string;
  clientAccountId?: string | undefined;
  name: string;
  criteria: SavedSearch["criteria"];
  alertInApp: boolean;
  alertEmail: boolean;
  emailFrequency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export function toSavedSearchSummary(search: SavedSearch): SavedSearchSummary {
  return {
    id: search.id,
    ownerUserId: search.ownerUserId,
    clientAccountId: search.clientAccountId,
    name: search.name,
    criteria: search.criteria,
    alertInApp: search.alertInApp,
    alertEmail: search.alertEmail,
    emailFrequency: search.emailFrequency,
    isActive: search.isActive,
    createdAt: search.createdAt.toISOString(),
    updatedAt: search.updatedAt.toISOString(),
  };
}

export type ExternalTenderSummary = Readonly<{
  id: string;
  source: string;
  marketType: string;
  externalId: string;
  title: string;
  description?: string | undefined;
  buyerName?: string | undefined;
  country?: string | undefined;
  region?: string | undefined;
  department?: string | undefined;
  city?: string | undefined;
  cpvCodes: readonly string[];
  estimatedAmount?: number | undefined;
  currency?: string | undefined;
  procedureType?: string | undefined;
  publicationDate?: string | undefined;
  submissionDeadline?: string | undefined;
  sourceUrl?: string | undefined;
  lots?: ExternalTender["lots"];
}>;

export function toExternalTenderSummary(tender: ExternalTender): ExternalTenderSummary {
  return {
    id: tender.id,
    source: tender.source,
    marketType: tender.marketType,
    externalId: tender.externalId,
    title: tender.title,
    description: tender.description,
    buyerName: tender.buyerName,
    country: tender.country,
    region: tender.region,
    department: tender.department,
    city: tender.city,
    cpvCodes: tender.cpvCodes,
    estimatedAmount: tender.estimatedAmount,
    currency: tender.currency,
    procedureType: tender.procedureType,
    publicationDate: tender.publicationDate?.toISOString(),
    submissionDeadline: tender.submissionDeadline?.toISOString(),
    sourceUrl: tender.sourceUrl,
    lots: tender.lots,
  };
}

export type SavedSearchMatchSummary = Readonly<{
  id: string;
  savedSearchId: string;
  externalTenderId: string;
  score: number;
  matchReasons: SavedSearchMatch["matchReasons"];
  status: string;
  firstMatchedAt: string;
  lastMatchedAt: string;
  tender: ExternalTenderSummary;
}>;

export function toSavedSearchMatchSummary(match: SavedSearchMatch, tender: ExternalTender): SavedSearchMatchSummary {
  return {
    id: match.id,
    savedSearchId: match.savedSearchId,
    externalTenderId: match.externalTenderId,
    score: match.score,
    matchReasons: match.matchReasons,
    status: match.status,
    firstMatchedAt: match.firstMatchedAt.toISOString(),
    lastMatchedAt: match.lastMatchedAt.toISOString(),
    tender: toExternalTenderSummary(tender),
  };
}
