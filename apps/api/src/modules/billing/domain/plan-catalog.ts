import { BillingInterval } from "./billing-interval";
import { UnsupportedBillingIntervalForPlanError } from "./errors";
import { EntitlementFeature } from "./entitlement-feature";
import { PlanTier } from "./plan-tier";
import { QuotaLimit, QuotaType, UNLIMITED } from "./quota-type";

/**
 * V2 Sprint 22 (billing, étape 22A) — catalogue commercial figé EN CODE (mission §20 : "ne pas
 * forcer artificiellement toutes ces notions dans une seule table si le domaine devient
 * incohérent"). Quatre paliers connus à l'avance, jamais éditables par un utilisateur ni par
 * Platform Admin ce sprint — même motif que `STRUCTURED_OUTPUT_REGISTRY` (generation) : un
 * registre de configuration métier stable n'a pas besoin d'être piloté par une table.
 *
 * Prix annuels = 11 × prix mensuel (mission §17 : "paiement initial = 6 589€" pour Business =
 * 599€ × 11), jamais un pourcentage de remise recalculé ailleurs — dérivés ici pour ne jamais
 * diverger entre deux endroits.
 */
export type PlanCatalogEntry = Readonly<{
  tier: PlanTier;
  displayName: string;
  billingIntervalsSupported: readonly BillingInterval[];
  /** Prix TTC-hors-taxes en centimes ; null si l'intervalle n'est pas supporté par ce palier. */
  monthlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  /** Paiement unique (PASS uniquement) ; null pour tous les autres paliers. */
  onePriceCents: number | null;
  entitlements: ReadonlySet<EntitlementFeature>;
  quotas: Readonly<Record<QuotaType, QuotaLimit>>;
}>;

function starterLikeQuotas(overrides: Partial<Record<QuotaType, QuotaLimit>> = {}): Record<QuotaType, QuotaLimit> {
  return {
    [QuotaType.AoMonthlyGrant]: 2,
    [QuotaType.AoRolloverCap]: 6,
    [QuotaType.UsersMax]: 2,
    [QuotaType.ChatAiDailyMax]: 10,
    [QuotaType.StorageGbMax]: 10,
    ...overrides,
  };
}

/**
 * Checkpoint TENDEROS-2.1-PRE-DECOM-FIX (REC-001) — quotas d'une organisation SANS aucun plan.
 *
 * POURQUOI CETTE LIGNE DE BASE EXISTE — `CreateOrganizationWithOwnerUseCase` cree atomiquement
 * l'organisation ET sa Membership OWNER, mais aucun etat commercial (l'essai Starter est pilote par
 * Stripe, Sprint 25). `getEffectiveLimit` renvoyait alors `0` pour TOUS les quotas, y compris
 * `USERS_MAX` : l'organisation naissait donc a `1 membre / 0 siege` et refusait tout ajout avec
 * `SEAT_LIMIT_EXCEEDED (1/0)` — son propre fondateur la mettait deja hors quota.
 *
 * CE QUE CETTE LIGNE DE BASE N'EST PAS — un nouveau palier commercial. Elle n'accorde AUCUN credit
 * AO, AUCUNE fonctionnalite, et n'autorise AUCUNE operation sur un Tender (`canOperateOnTender` ne
 * la consulte jamais). Acheter reste l'unique moyen d'obtenir un second siege : Stripe n'est pas
 * contourne. Elle rend seulement le moteur d'entitlement COHERENT avec le bootstrap, en garantissant
 * l'invariant `USERS_MAX >= membres crees par l'onboarding` (1 >= 1).
 */
export const NO_PLAN_BASELINE_QUOTAS: Readonly<Record<QuotaType, QuotaLimit>> = {
  [QuotaType.AoMonthlyGrant]: 0,
  [QuotaType.AoRolloverCap]: 0,
  /** Le fondateur, et lui seul. */
  [QuotaType.UsersMax]: 1,
  [QuotaType.ChatAiDailyMax]: 0,
  [QuotaType.StorageGbMax]: 0,
};

export const PLAN_CATALOG: Readonly<Record<PlanTier, PlanCatalogEntry>> = {
  /**
   * Mission §3/§4 — "Pass = 1 AO + fonctionnalités métier Starter + paiement unique + accès limité
   * à ce dossier". Quotas STRICTEMENT plafonnés au niveau Starter (jamais Business, mission §8),
   * mais `AoMonthlyGrant`/`AoRolloverCap` valent 0 : le crédit du Pass n'est PAS un grant récurrent
   * du ledger (22B) — c'est l'unité individuelle `OrganizationPassPurchase` elle-même qui porte le
   * droit d'usage, jamais un solde numérique.
   */
  [PlanTier.Pass]: {
    tier: PlanTier.Pass,
    displayName: "Pass AO",
    billingIntervalsSupported: [],
    monthlyPriceCents: null,
    yearlyPriceCents: null,
    onePriceCents: 9900,
    entitlements: new Set(),
    quotas: starterLikeQuotas({ [QuotaType.AoMonthlyGrant]: 0, [QuotaType.AoRolloverCap]: 0 }),
  },
  [PlanTier.Starter]: {
    tier: PlanTier.Starter,
    displayName: "Starter",
    billingIntervalsSupported: [BillingInterval.Monthly, BillingInterval.Yearly],
    monthlyPriceCents: 19900,
    yearlyPriceCents: 19900 * 11,
    onePriceCents: null,
    entitlements: new Set(),
    quotas: starterLikeQuotas(),
  },
  [PlanTier.Business]: {
    tier: PlanTier.Business,
    displayName: "Business",
    billingIntervalsSupported: [BillingInterval.Monthly, BillingInterval.Yearly],
    monthlyPriceCents: 59900,
    yearlyPriceCents: 59900 * 11,
    onePriceCents: null,
    entitlements: new Set([EntitlementFeature.AdvancedCollaboration, EntitlementFeature.ApprovalWorkflows]),
    quotas: {
      [QuotaType.AoMonthlyGrant]: 10,
      [QuotaType.AoRolloverCap]: 60,
      [QuotaType.UsersMax]: 10,
      [QuotaType.ChatAiDailyMax]: 150,
      [QuotaType.StorageGbMax]: 150,
    },
  },
  [PlanTier.Enterprise]: {
    tier: PlanTier.Enterprise,
    displayName: "Enterprise",
    billingIntervalsSupported: [BillingInterval.Monthly, BillingInterval.Yearly],
    monthlyPriceCents: 109900,
    yearlyPriceCents: 109900 * 11,
    onePriceCents: null,
    entitlements: new Set([
      EntitlementFeature.AdvancedCollaboration,
      EntitlementFeature.ApprovalWorkflows,
      EntitlementFeature.PublicApi,
      EntitlementFeature.Webhooks,
      EntitlementFeature.AutomationConnectors,
    ]),
    quotas: {
      // Mission §14 : "illimités* AO/utilisateurs fair-use" — jamais un grand nombre magique.
      [QuotaType.AoMonthlyGrant]: UNLIMITED,
      [QuotaType.AoRolloverCap]: UNLIMITED,
      [QuotaType.UsersMax]: UNLIMITED,
      [QuotaType.ChatAiDailyMax]: 300,
      [QuotaType.StorageGbMax]: 300,
    },
  },
} as const;

/**
 * Mission §10 — "ne pas hardcoder arbitrairement une expiration métier sans vérifier
 * l'architecture [...] rendre la policy configurable et documenter la décision". Aucune durée
 * commerciale n'a été décidée à ce stade : `null` signifie "pas d'expiration" et reste le
 * comportement par défaut tant qu'une décision commerciale n'a pas fixé de durée. Lu une seule
 * fois par `RecordPassPurchaseUseCase` (22A) au moment de la création — jamais recalculé ailleurs.
 */
export const PASS_EXPIRATION_POLICY_DAYS: number | null = null;

export function getPlanCatalogEntry(tier: PlanTier): PlanCatalogEntry {
  return PLAN_CATALOG[tier];
}

export function resolvePriceCents(tier: PlanTier, interval: BillingInterval): number {
  const entry = getPlanCatalogEntry(tier);
  const price = interval === BillingInterval.Monthly ? entry.monthlyPriceCents : entry.yearlyPriceCents;
  if (price === null) {
    throw new UnsupportedBillingIntervalForPlanError(tier, interval);
  }
  return price;
}

export function planHasFeature(tier: PlanTier, feature: EntitlementFeature): boolean {
  return getPlanCatalogEntry(tier).entitlements.has(feature);
}

export function getPlanQuotaLimit(tier: PlanTier, quota: QuotaType): QuotaLimit {
  return getPlanCatalogEntry(tier).quotas[quota];
}
