// V2 Sprint 22 (billing, étape 22D) — miroir frontend des enums/DTOs du module `billing` (API),
// même motif que `integrations-types.ts` : chaque type reflète 1:1 la forme retournée par le
// backend, jamais une seconde source de vérité métier.

import type { BadgeTone } from "../components/ui/badge";

export const PLAN_TIERS = ["PASS", "STARTER", "BUSINESS", "ENTERPRISE"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const PLAN_TIER_LABELS: Record<PlanTier, string> = {
  PASS: "Pass AO",
  STARTER: "Starter",
  BUSINESS: "Business",
  ENTERPRISE: "Enterprise",
};

export const SUBSCRIPTION_PLAN_TIERS = ["STARTER", "BUSINESS", "ENTERPRISE"] as const;
export type SubscriptionPlanTier = (typeof SUBSCRIPTION_PLAN_TIERS)[number];

export type BillingInterval = "MONTHLY" | "YEARLY";

export const BILLING_INTERVAL_LABELS: Record<BillingInterval, string> = {
  MONTHLY: "Mensuel",
  YEARLY: "Annuel",
};

// V2 Sprint 25 (Trial Starter) — "TRIALING" ajouté, miroir de `SubscriptionStatus` backend
// (`apps/api/.../billing/domain/subscription-status.ts`), jamais un second statut inventé côté
// frontend.
export type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED";

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  ACTIVE: "Actif",
  TRIALING: "Essai",
  PAST_DUE: "Paiement en retard",
  CANCELED: "Résilié",
};

export function subscriptionStatusBadgeClass(status: SubscriptionStatus): string {
  switch (status) {
    case "ACTIVE":
      return "bg-green-100 text-green-800";
    case "TRIALING":
      return "bg-tenderos-gold/15 text-tenderos-navy";
    case "PAST_DUE":
      return "bg-amber-100 text-amber-800";
    case "CANCELED":
      return "bg-neutral-200 text-neutral-500";
  }
}

/** Checkpoint TENDEROS-2.1-P2.3-E8 — équivalent `BadgeTone` de `subscriptionStatusBadgeClass`
 *  (motif déjà établi ailleurs, `deadlineBucketTone`/`membershipStatusTone`), pour `/app/subscription`
 *  (Design System E5.1, `&lt;Badge tone={...}&gt;`). `subscriptionStatusBadgeClass` reste inchangée —
 *  encore utilisée par `platform-admin/organization-billing-section.tsx`, hors périmètre E8. */
export function subscriptionStatusTone(status: SubscriptionStatus): BadgeTone {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "TRIALING":
      return "gold";
    case "PAST_DUE":
      return "warning";
    case "CANCELED":
      return "neutral";
  }
}

export type PlanSource = "STRIPE" | "MANUAL" | "GRANTED";

export const PLAN_SOURCE_LABELS: Record<PlanSource, string> = {
  STRIPE: "Stripe",
  MANUAL: "Manuel (Platform Admin)",
  GRANTED: "Offert (pilote/démo)",
};

export type PassPurchaseStatus = "AVAILABLE" | "CONSUMED";

export const PASS_PURCHASE_STATUS_LABELS: Record<PassPurchaseStatus, string> = {
  AVAILABLE: "Disponible",
  CONSUMED: "Consommé",
};

export function passPurchaseStatusBadgeClass(status: PassPurchaseStatus): string {
  return status === "AVAILABLE" ? "bg-green-100 text-green-800" : "bg-neutral-200 text-neutral-700";
}

export const ENTITLEMENT_FEATURES = ["ADVANCED_COLLABORATION", "APPROVAL_WORKFLOWS", "PUBLIC_API", "WEBHOOKS", "AUTOMATION_CONNECTORS"] as const;
export type EntitlementFeature = (typeof ENTITLEMENT_FEATURES)[number];

export const ENTITLEMENT_FEATURE_LABELS: Record<EntitlementFeature, string> = {
  ADVANCED_COLLABORATION: "Collaboration avancée",
  APPROVAL_WORKFLOWS: "Circuits de validation",
  PUBLIC_API: "API publique",
  WEBHOOKS: "Webhooks",
  AUTOMATION_CONNECTORS: "Connecteurs d'automatisation (n8n/Make)",
};

export const QUOTA_TYPES = ["AO_MONTHLY_GRANT", "AO_ROLLOVER_CAP", "USERS_MAX", "CHAT_AI_DAILY_MAX", "STORAGE_GB_MAX"] as const;
export type QuotaType = (typeof QUOTA_TYPES)[number];

export const UNLIMITED = "UNLIMITED" as const;
export type QuotaLimit = number | typeof UNLIMITED;

export function formatQuotaLimit(limit: QuotaLimit): string {
  return limit === UNLIMITED ? "Illimité*" : String(limit);
}

export function formatEurosFromCents(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

export type OrganizationSubscriptionDto = {
  id: string;
  organizationId: string;
  planTier: SubscriptionPlanTier;
  billingInterval: BillingInterval;
  status: SubscriptionStatus;
  source: PlanSource;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  /** V2 Sprint 25 (Trial Starter) — non-undefined UNIQUEMENT pendant TRIALING (miroir backend,
   *  `OrganizationSubscription.trialEndsAt`), jamais un second compteur Trial calculé côté client. */
  trialEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** V2 Sprint 25 (Dashboard Premium) — mission §25.62 "Essai Starter X jours restants", même
 *  arrondi que le backend (`daysRemainingInTrial`, Math.ceil, jamais négatif). */
export function daysRemainingInTrial(trialEndsAt: string, now: Date = new Date()): number {
  const diffMs = new Date(trialEndsAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

export type OrganizationEntitlementsDto = {
  planTier: PlanTier | null;
  entitlements: readonly EntitlementFeature[];
  quotas: Record<QuotaType, QuotaLimit> | null;
};

export type PassPurchaseDto = {
  id: string;
  organizationId: string;
  status: PassPurchaseStatus;
  externalReference: string;
  priceCents: number;
  currency: string;
  purchasedAt: string;
  expiresAt: string | null;
  consumedTenderId: string | null;
  consumedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PassPurchasePage = { items: PassPurchaseDto[]; nextCursor: string | null };

export type OrganizationUsageDto = {
  activeUsers: number;
  chatMessagesToday: number;
  storageBytesUsed: number;
};

export function formatStorageBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toLocaleString("fr-FR", { maximumFractionDigits: gb < 10 ? 2 : 0 })} Go`;
}

export const AO_CREDIT_MOVEMENT_TYPES = ["GRANT", "CONSUMPTION", "MANUAL_ADJUSTMENT", "REVERSAL"] as const;
export type AoCreditMovementType = (typeof AO_CREDIT_MOVEMENT_TYPES)[number];

export const AO_CREDIT_MOVEMENT_TYPE_LABELS: Record<AoCreditMovementType, string> = {
  GRANT: "Attribution",
  CONSUMPTION: "Consommation",
  MANUAL_ADJUSTMENT: "Ajustement manuel",
  REVERSAL: "Annulation",
};

/** Checkpoint TENDEROS-2.1-P2.3-E9 (mission §56, historique des crédits AO self-service). */
export function aoCreditMovementTypeTone(type: AoCreditMovementType): BadgeTone {
  switch (type) {
    case "GRANT":
      return "success";
    case "CONSUMPTION":
      return "info";
    case "MANUAL_ADJUSTMENT":
      return "gold";
    case "REVERSAL":
      return "warning";
  }
}

export type AoCreditLedgerEntryDto = {
  id: string;
  organizationId: string;
  type: AoCreditMovementType;
  amount: number;
  balanceAfter: number;
  period?: string;
  tenderId?: string;
  reason?: string;
  actorPlatformAdministratorId?: string;
  createdAt: string;
};

export type AoCreditLedgerPage = { items: AoCreditLedgerEntryDto[]; nextCursor: string | null };

/** Correctif audit Codex 22D (P2) — un identifiant Stripe (`cus_...`) n'est pas un secret, mais ne
 *  doit pas s'afficher en entier sans nécessité dans une vue Platform Admin (moindre exposition). */
export function truncateStripeId(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
}

/** Vérification UI uniquement — le backend revalide toujours via `assertCanManageBilling`
 *  (OWNER/ORGANIZATION_ADMIN seulement, mission "seul OWNER/ORGANIZATION_ADMIN peut engager la
 *  carte bancaire de l'organisation"). */
const BILLING_MANAGEMENT_TIER = ["OWNER", "ORGANIZATION_ADMIN"];
export function canManageBilling(role: string | undefined): boolean {
  return role !== undefined && BILLING_MANAGEMENT_TIER.includes(role);
}

/**
 * V2 Sprint 23 (landing) — miroir de `GetPublicPlanCatalogUseCase` (API, module `billing`), SEULE
 * source de vérité Pricing (mission §17/§55) : jamais un second catalogue maintenu à la main ici.
 * Checkpoint TENDEROS-2.1-P2.3-E8 — `/app/subscription` (écran Abonnement authentifié) lit
 * désormais ce même catalogue dynamique (`fetchPlanCatalog`, `billing-actions.ts`) : l'ancien
 * `PLAN_PRICES_CENTS` figé (prix seulement, jamais les entitlements/quotas réels) était la cause
 * racine du bug produit "l'utilisateur ne peut choisir que Starter" — supprimé, jamais recréé.
 */
export type PublicPlanCatalogEntry = {
  tier: PlanTier;
  displayName: string;
  billingIntervalsSupported: BillingInterval[];
  monthlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  onePriceCents: number | null;
  entitlements: string[];
  quotas: Record<QuotaType, QuotaLimit>;
};
