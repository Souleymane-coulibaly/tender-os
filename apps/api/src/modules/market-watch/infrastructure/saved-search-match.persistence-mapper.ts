import type { Prisma, SavedSearchMatch as PrismaSavedSearchMatch } from "@prisma/client";
import { SavedSearchMatch } from "../domain/saved-search-match.entity";
import type { MatchReason } from "../domain/services/matching-engine";

export function toDomainSavedSearchMatch(row: PrismaSavedSearchMatch): SavedSearchMatch {
  return SavedSearchMatch.rehydrate({
    id: row.id,
    organizationId: row.organizationId,
    savedSearchId: row.savedSearchId,
    externalTenderId: row.externalTenderId,
    score: row.score,
    matchReasons: row.matchReasons as unknown as MatchReason[],
    status: row.status,
    firstMatchedAt: row.firstMatchedAt,
    lastMatchedAt: row.lastMatchedAt,
    notifiedInAppAt: row.notifiedInAppAt ?? undefined,
    emailStatus: row.emailStatus,
    emailAttemptCount: row.emailAttemptCount,
    emailLastError: row.emailLastError ?? undefined,
    notifiedEmailAt: row.notifiedEmailAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export function toSavedSearchMatchData(match: SavedSearchMatch): Prisma.SavedSearchMatchUncheckedCreateInput {
  return {
    id: match.id,
    organizationId: match.organizationId,
    savedSearchId: match.savedSearchId,
    externalTenderId: match.externalTenderId,
    score: match.score,
    matchReasons: match.matchReasons as unknown as Prisma.InputJsonValue,
    status: match.status,
    firstMatchedAt: match.firstMatchedAt,
    lastMatchedAt: match.lastMatchedAt,
    notifiedInAppAt: match.notifiedInAppAt ?? null,
    emailStatus: match.emailStatus,
    emailAttemptCount: match.emailAttemptCount,
    emailLastError: match.emailLastError ?? null,
    notifiedEmailAt: match.notifiedEmailAt ?? null,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
  };
}
