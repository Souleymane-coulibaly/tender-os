import type { BadgeTone } from "../components/ui";

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
  newMatchCount?: number;
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

/** Design System — ton de `Badge` du type de marché (remplace `marketTypeBadgeClass`). Public :
 *  `info` (ancien bleu) ; tout autre type : `gold` (ancien violet, sans équivalent dans les jetons). */
export function marketTypeTone(marketType: string): BadgeTone {
  return marketType === "PUBLIC" ? "info" : "gold";
}

/** Design System — ton de `Badge` du statut d'un match (remplace `matchStatusBadgeClass`). */
export const MATCH_STATUS_TONE: Record<SavedSearchMatchSummary["status"], BadgeTone> = {
  NEW: "warning",
  INTERESTED: "success",
  IGNORED: "neutral",
};

/** Même convention que Dashboard Sprint 15 (`classify-deadline-bucket`) — urgence visuelle. */
export function deadlineUrgencyClass(deadline: string | undefined): string {
  if (!deadline) return "text-tenderos-slate";
  const days = (new Date(deadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  if (days < 0) return "text-tenderos-slate/70";
  if (days <= 7) return "text-danger-fg font-semibold";
  if (days <= 14) return "text-warning-fg font-medium";
  return "text-tenderos-navy";
}

/** Design System — ton de `Badge` du score de pertinence (remplace `scoreBadgeClass`, mêmes seuils). */
export function scoreTone(score: number): BadgeTone {
  if (score >= 70) return "success";
  if (score >= 40) return "warning";
  return "neutral";
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
