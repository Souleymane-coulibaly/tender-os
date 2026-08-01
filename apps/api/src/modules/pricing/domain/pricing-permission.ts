/**
 * Capacités ORG-WIDE de Pricing uniquement (mission Sprint 7 §"Voir coût organisation global :
 * OWNER Oui, ADMIN Oui, tout le reste Non") — réservé à OWNER/ORGANIZATION_ADMIN, jamais délégable
 * via une affectation client. Même motif qu'`AiBenchmarkPermission` (Sprint 5.2) et
 * `GenerationPermission` (Sprint 6) : un seul palier, pas de distinction lecture/écriture par rôle
 * client puisque cette capacité n'est pas liée à un client précis.
 *
 * Les actions scopées à un Tender/client (voir un coût, créer/recalculer/archiver une estimation)
 * ne passent PAS par cet enum : elles réutilisent `AssertClientAccessUseCase` de client-portfolio
 * avec `ReadPricing`/`ManagePricing` (voir client-portfolio/domain/client-permission.ts) — la même
 * policy d'accès client centralisée que Tenders/Documents/Analysis/Knowledge Base/Generation,
 * jamais recopiée ici.
 */
export const PricingPermission = {
  ReadOrganizationSummary: "PRICING_READ_ORGANIZATION_SUMMARY",
} as const;

export type PricingPermission = (typeof PricingPermission)[keyof typeof PricingPermission];

const ALL_PERMISSIONS: readonly PricingPermission[] = Object.values(PricingPermission);

export const ROLE_PRICING_PERMISSIONS: Record<string, readonly PricingPermission[]> = {
  OWNER: ALL_PERMISSIONS,
  ORGANIZATION_ADMIN: ALL_PERMISSIONS,
  BID_MANAGER: [],
  CONTRIBUTOR: [],
  REVIEWER: [],
  EXECUTIVE: [],
  EXTERNAL_CONSULTANT: [],
  READ_ONLY: [],
};

export function roleHasPricingPermission(role: string, permission: PricingPermission): boolean {
  return (ROLE_PRICING_PERMISSIONS[role] ?? []).includes(permission);
}
