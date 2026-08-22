import type { Tender } from "../../domain/tender.aggregate";
import type { TenderStatus } from "../../domain/tender-status";

export type TenderPage = { items: Tender[]; nextCursor: string | null };

export type TenderListFilter = Readonly<{
  organizationId: string;
  status?: TenderStatus | undefined;
  internalOwnerId?: string | undefined;
  /** Mission Sprint 5.1 §"filtrer les appels d'offres par client" — filtre explicite choisi par
   *  l'utilisateur (sélecteur client de la vue Liste), distinct de `restrictToClientAccountIds`. */
  clientAccountId?: string | undefined;
  /** Mission Sprint 5.1 §"un utilisateur standard ne voit que les tenders des clients auxquels il
   *  est affecté" — restriction AUTOMATIQUE calculée par `ListAccessibleClientsUseCase`, jamais
   *  fournie par le client. `undefined` signifie "aucune restriction" (OWNER/ADMIN), un tableau
   *  (même vide) restreint strictement. */
  restrictToClientAccountIds?: readonly string[] | undefined;
  /** Restreint aux ids donnés (ex. résultat d'un TenderSearchProvider) — filtre générique,
   *  volontairement agnostique de la façon dont l'ensemble d'ids a été calculé. */
  idsFilter?: readonly string[] | undefined;
  deadlineAfter?: Date | undefined;
  deadlineBefore?: Date | undefined;
  overdue?: boolean | undefined;
  /** V2 Sprint 16 (Integration Hub) — filtre de synchronisation incrémentale pour la Public API
   *  (mission §68 "updatedSince"), gouverné/whitelisté au même titre que les autres filtres. */
  updatedSince?: Date | undefined;
}>;

export type TenderCountByStatusFilter = Readonly<{ organizationId: string; restrictToClientAccountIds?: readonly string[] | undefined }>;

/** Checkpoint TENDEROS-2.1-P2.3-E5 (Dashboard V2, Premium Analytics addendum §4/§26) — alimente le
 *  graphique d'activité (tendance de création d'AO). Projection à colonne unique (`createdAt`
 *  seulement, jamais l'agrégat complet) sur une fenêtre bornée par date — l'organisation et le
 *  scope Client sont TOUJOURS appliqués, mêmes garanties que `countByStatus`. Le bucketing par jour
 *  (et le respect du fuseau horaire de l'organisation) reste la responsabilité du use case
 *  appelant, jamais de ce port — ce port ne fait qu'agréger/projeter, jamais une décision métier. */
export type TenderListCreatedAtFilter = Readonly<{
  organizationId: string;
  restrictToClientAccountIds?: readonly string[] | undefined;
  since: Date;
  limit: number;
}>;

export interface TenderRepository {
  findById(input: { organizationId: string; tenderId: string }): Promise<Tender | null>;
  list(
    input: TenderListFilter & {
      cursor?: string | undefined;
      limit: number;
      sort?: "createdAt" | "submissionDeadline" | "title" | "updatedAt" | undefined;
      sortDirection?: "asc" | "desc" | undefined;
    },
  ): Promise<TenderPage>;
  /** Total correspondant aux mêmes filtres que `list()`, indépendamment de la pagination —
   *  utilisé pour les en-têtes de colonnes du Kanban et les statistiques (mission §6, §8). */
  count(input: TenderListFilter): Promise<number>;
  /** Une requête groupée (`GROUP BY status`) plutôt que 9 `count()` séquentiels — évite le
   *  N+1 pour la répartition par statut des statistiques (mission §8). */
  countByStatus(input: TenderCountByStatusFilter): Promise<Record<string, number>>;
  /** Checkpoint E5 — voir `TenderListCreatedAtFilter`. Retourne les dates de création brutes,
   *  triées de manière non garantie (le use case appelant trie/bucket) ; bornée par `since`+`limit`,
   *  jamais un scan complet de l'organisation. */
  listCreatedAtSince(input: TenderListCreatedAtFilter): Promise<readonly Date[]>;
  save(tender: Tender): Promise<void>;
}

export const TENDER_REPOSITORY = Symbol("TENDER_REPOSITORY");
