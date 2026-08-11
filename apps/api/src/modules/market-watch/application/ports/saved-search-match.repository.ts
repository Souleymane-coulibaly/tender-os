import type { SavedSearchMatch } from "../../domain/saved-search-match.entity";

export type SavedSearchMatchPage = Readonly<{ items: SavedSearchMatch[]; nextCursor: string | null }>;

export interface SavedSearchMatchRepository {
  /** Mission §44/§48 — idempotent (`@@unique([savedSearchId, externalTenderId])`), retourne
   *  `false` si le match existait déjà (jamais une seconde alerte "nouveau marché"). */
  createIfNotExists(match: SavedSearchMatch): Promise<boolean>;
  save(match: SavedSearchMatch): Promise<void>;
  findBySavedSearchAndTender(input: { organizationId: string; savedSearchId: string; externalTenderId: string }): Promise<SavedSearchMatch | null>;
  findById(input: { organizationId: string; matchId: string }): Promise<SavedSearchMatch | null>;
  /** Mission §66/§67 — lues par le worker d'alertes email, jamais dans la transaction de matching.
   *  Correctif audit P1-001 — CLAIM atomique (`UPDATE ... WHERE email_status = 'PENDING' ...
   *  FOR UPDATE SKIP LOCKED`, même motif que `PrismaOutboxEventRepository.claimPendingBatch`),
   *  jamais une simple lecture : deux appels concurrents (deux workers, ou deux ticks qui se
   *  chevauchent) reçoivent chacun un ensemble DISJOINT de matches, jamais le même match deux fois.
   *  Reprend aussi les matches restés `SENDING` au-delà de `staleClaimThresholdMs` (bail expiré —
   *  crash worker après claim, avant envoi/sauvegarde). */
  claimPendingEmailBatch(input: { organizationId?: string | undefined; limit: number; now: Date; staleClaimThresholdMs: number }): Promise<SavedSearchMatch[]>;
  listBySavedSearch(input: { organizationId: string; savedSearchId: string; limit: number; cursor?: string | undefined }): Promise<SavedSearchMatchPage>;
}

export const SAVED_SEARCH_MATCH_REPOSITORY = Symbol("SAVED_SEARCH_MATCH_REPOSITORY");
