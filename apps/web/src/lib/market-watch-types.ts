export type SavedSearchCriteria = {
  includeKeywords: readonly string[];
  excludeKeywords: readonly string[];
  cpvCodes: readonly string[];
  countries: readonly string[];
  regions: readonly string[];
  departments: readonly string[];
  cities: readonly string[];
  marketTypes: readonly string[];
  sources: readonly string[];
  minAmount?: number | undefined;
  maxAmount?: number | undefined;
  includeUnknownAmount: boolean;
  publishedAfter?: string | undefined;
  deadlineAfterDays?: number | undefined;
  deadlineBeforeDate?: string | undefined;
  procedureTypes: readonly string[];
};

export type SavedSearchSummary = {
  id: string;
  ownerUserId: string;
  clientAccountId?: string;
  name: string;
  criteria: SavedSearchCriteria;
  alertInApp: boolean;
  alertEmail: boolean;
  emailFrequency: "IMMEDIATE" | "DAILY_DIGEST";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExternalTenderLot = { number: string; description?: string; cpvCode?: string };

export type ExternalTenderSummary = {
  id: string;
  source: string;
  marketType: "PUBLIC" | "PRIVATE";
  externalId: string;
  title: string;
  description?: string;
  buyerName?: string;
  country?: string;
  region?: string;
  department?: string;
  city?: string;
  cpvCodes: readonly string[];
  estimatedAmount?: number;
  currency?: string;
  procedureType?: string;
  publicationDate?: string;
  submissionDeadline?: string;
  sourceUrl?: string;
  lots?: readonly ExternalTenderLot[];
};

export type MatchReason = { criterion: string; label: string; matched: boolean };

export type SavedSearchMatchSummary = {
  id: string;
  savedSearchId: string;
  externalTenderId: string;
  score: number;
  matchReasons: readonly MatchReason[];
  status: "NEW" | "INTERESTED" | "IGNORED";
  firstMatchedAt: string;
  lastMatchedAt: string;
  tender: ExternalTenderSummary;
};

export const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "Manuel",
  BOAMP: "BOAMP",
  TED: "TED",
  PRIVATE: "Privé",
  OTHER: "Autre",
};

export const MARKET_TYPE_LABELS: Record<string, string> = { PUBLIC: "Public", PRIVATE: "Privé" };

export function marketTypeBadgeClass(marketType: string): string {
  return marketType === "PUBLIC" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800";
}

export function matchStatusBadgeClass(status: string): string {
  switch (status) {
    case "INTERESTED":
      return "bg-green-100 text-green-800";
    case "IGNORED":
      return "bg-neutral-200 text-neutral-500";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

/** Même convention que Dashboard Sprint 15 (`classify-deadline-bucket`) — urgence visuelle. */
export function deadlineUrgencyClass(deadline: string | undefined): string {
  if (!deadline) return "text-neutral-500";
  const days = (new Date(deadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  if (days < 0) return "text-neutral-400";
  if (days <= 7) return "text-red-600 font-semibold";
  if (days <= 14) return "text-amber-600 font-medium";
  return "text-neutral-700";
}

export function scoreBadgeClass(score: number): string {
  if (score >= 70) return "bg-green-100 text-green-800";
  if (score >= 40) return "bg-amber-100 text-amber-800";
  return "bg-neutral-200 text-neutral-600";
}

export type NotificationSummary = {
  id: string;
  type: string;
  title: string;
  body?: string;
  targetUrl?: string;
  metadata?: Record<string, unknown>;
  readAt?: string;
  createdAt: string;
};

/** Vérification UI uniquement — le backend revalide toujours via `MarketWatchPermission`
 *  (mission §70 : tout rôle actif sauf READ_ONLY/EXTERNAL_CONSULTANT). */
const EXCLUDED_ROLES = ["READ_ONLY", "EXTERNAL_CONSULTANT"];
export function canUseMarketWatch(role: string | undefined): boolean {
  return role !== undefined && !EXCLUDED_ROLES.includes(role);
}
