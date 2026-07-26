/**
 * Rôles plateforme — aucun rôle plateforme n'est documenté dans le projet (recherche
 * exhaustive dans bible/, docs/, skills/ : aucune occurrence). Utilise exactement
 * l'ensemble minimal proposé par la mission, dans un mécanisme distinct des rôles
 * d'organisation (jamais mélangé à Memberships).
 */
export const PlatformRole = {
  Owner: "PLATFORM_OWNER",
  Admin: "PLATFORM_ADMIN",
  Support: "PLATFORM_SUPPORT",
} as const;

export type PlatformRole = (typeof PlatformRole)[keyof typeof PlatformRole];

export function isPlatformRole(value: string): value is PlatformRole {
  return Object.values(PlatformRole).includes(value as PlatformRole);
}
