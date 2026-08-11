import { MarketWatchPermissionMissingError } from "./errors";

/**
 * Permissions Veille (mission §70) — matrice en code, même motif que
 * `opportunity/domain/opportunity-permission.ts`. Décision Sprint 17 (validée) : la veille est un
 * outil de travail personnel, pas une configuration sensible d'organisation — palier large
 * (CONTRIBUTOR+), jamais aussi strict qu'Integration Hub (OWNER/ADMIN uniquement).
 *
 * `CreateOpportunity` n'existe PAS ici volontairement : la promotion ExternalTender -> Opportunity
 * délègue entièrement à `CreateOpportunityUseCase` (opportunity module), qui applique déjà sa
 * propre permission (`OpportunityPermission.Create`) + `AssertClientAccessUseCase` si un client
 * est renseigné — dupliquer une permission indépendante ici créerait un risque d'incohérence
 * (deux portes qui pourraient un jour diverger) sans bénéfice réel.
 */
export const MarketWatchPermission = {
  /** Voir les marchés détectés / ses propres SavedSearch et leurs matches. */
  Read: "market_watch:read",
  /** Créer/modifier/désactiver/supprimer ses PROPRES SavedSearch (jamais celles d'un autre
   *  utilisateur, voir `SavedSearchOwnershipRequiredError`). */
  ManageSavedSearch: "market_watch:manage_saved_search",
} as const;

export type MarketWatchPermission = (typeof MarketWatchPermission)[keyof typeof MarketWatchPermission];

const ALL_PERMISSIONS = Object.values(MarketWatchPermission);

export const ROLE_MARKET_WATCH_PERMISSIONS: Record<string, readonly MarketWatchPermission[]> = {
  OWNER: ALL_PERMISSIONS,
  ORGANIZATION_ADMIN: ALL_PERMISSIONS,
  BID_MANAGER: ALL_PERMISSIONS,
  CONTRIBUTOR: ALL_PERMISSIONS,
  REVIEWER: ALL_PERMISSIONS,
  EXECUTIVE: ALL_PERMISSIONS,
  EXTERNAL_CONSULTANT: [],
  READ_ONLY: [],
};

export function roleHasMarketWatchPermission(role: string, permission: MarketWatchPermission): boolean {
  return (ROLE_MARKET_WATCH_PERMISSIONS[role] ?? []).includes(permission);
}

export function assertHasMarketWatchPermission(role: string, permission: MarketWatchPermission): void {
  if (!roleHasMarketWatchPermission(role, permission)) {
    throw new MarketWatchPermissionMissingError();
  }
}
