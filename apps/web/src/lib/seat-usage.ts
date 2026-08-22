import type { OrganizationEntitlementsDto, OrganizationUsageDto } from "./billing-types";

export type SeatUsage = {
  activeUsers: number;
  limit: number | "UNLIMITED";
  atLimit: boolean;
};

/**
 * Checkpoint TENDEROS-2.1-P2.3-E2 (Onboarding V2, mission §15/§23) — SEUL point qui combine
 * `GET /billing/entitlements` (limite déclarée du plan) et `GET /billing/usage` (nombre réel de
 * membres actifs) pour décider si l'invitation doit être désactivée côté UI. Jamais un calcul
 * commercial (mission §3 "l'onboarding ne calcule jamais lui-même entitlement/users_max") : ce n'est
 * qu'une COMBINAISON de deux lectures déjà autoritaires, le backend reste TOUJOURS la seule autorité
 * qui refuse réellement une invitation au-delà de la limite (`SeatLimitExceededError`, 402) — ce
 * helper ne fait qu'anticiper l'UX, jamais une seconde vérification qui pourrait diverger du backend.
 * Réutilisé identiquement par `/app/members` et l'étape onboarding `/onboarding/equipe` — jamais deux
 * calculs différents.
 */
export function computeSeatUsage(entitlements: OrganizationEntitlementsDto, usage: OrganizationUsageDto): SeatUsage {
  const limit = entitlements.quotas?.USERS_MAX ?? "UNLIMITED";
  const atLimit = limit !== "UNLIMITED" && usage.activeUsers >= limit;
  return { activeUsers: usage.activeUsers, limit, atLimit };
}

export function formatSeatUsage(usage: SeatUsage): string {
  return usage.limit === "UNLIMITED" ? `${usage.activeUsers} utilisateur${usage.activeUsers > 1 ? "s" : ""}` : `${usage.activeUsers} / ${usage.limit} utilisateurs`;
}
