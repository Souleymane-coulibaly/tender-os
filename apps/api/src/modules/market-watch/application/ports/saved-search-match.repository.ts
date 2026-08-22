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
  /** Checkpoint TENDEROS-2.1-P2.3-E3, mission §31/§39 — badge "NEW" par veille sur la liste. UNE
   *  seule requête groupée (jamais N requêtes, une par veille — mission §44 "audit avant
   *  d'optimiser", ici l'optimisation triviale d'emblée évite le N+1 plutôt que de le créer puis
   *  le corriger). Absent du résultat = 0 (jamais une entrée à `undefined`). */
  countByStatus(input: { organizationId: string; savedSearchIds: readonly string[]; status: string }): Promise<Record<string, number>>;
}

export const SAVED_SEARCH_MATCH_REPOSITORY = Symbol("SAVED_SEARCH_MATCH_REPOSITORY");
