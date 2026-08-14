export { BillingModule } from "./billing.module";

export { PlanTier, isPlanTier, SUBSCRIPTION_PLAN_TIERS, isSubscriptionPlanTier } from "./domain/plan-tier";
export type { SubscriptionPlanTier } from "./domain/plan-tier";
export { BillingInterval, isBillingInterval } from "./domain/billing-interval";
export { EntitlementFeature, isEntitlementFeature } from "./domain/entitlement-feature";
export { QuotaType, UNLIMITED, isQuotaType } from "./domain/quota-type";
export type { QuotaLimit } from "./domain/quota-type";
export { PLAN_CATALOG, PASS_EXPIRATION_POLICY_DAYS, getPlanCatalogEntry, planHasFeature, getPlanQuotaLimit, resolvePriceCents } from "./domain/plan-catalog";
export type { PlanCatalogEntry } from "./domain/plan-catalog";
export { SubscriptionStatus } from "./domain/subscription-status";
export { PlanSource } from "./domain/plan-source";
export { PassPurchaseStatus } from "./domain/pass-purchase-status";
export { EntitlementFeatureNotAvailableError, InsufficientAoCreditsError } from "./domain/errors";
export { AoCreditMovementType } from "./domain/ao-credit-movement-type";
export type { AoCreditLedgerEntry } from "./domain/ao-credit-ledger-entry";

export { ENTITLEMENT_SERVICE } from "./application/services/entitlement.service";
export type { EntitlementService, EntitlementContext } from "./application/services/entitlement.service";
// V2 Sprint 22 (billing, étape 22A, correctif audit Codex P1-01) — réexporté pour que les modules
// différenciants (integrations, workspace, connectors...) gatent leurs points d'entrée sans
// dupliquer le "if (!allowed) throw" à chaque site d'appel.
export { assertEntitlementFeature } from "./application/policies/assert-entitlement-feature";
export { AssignSubscriptionUseCase } from "./application/use-cases/assign-subscription.use-case";
export type { AssignSubscriptionCommand } from "./application/use-cases/assign-subscription.use-case";
export { CancelSubscriptionUseCase } from "./application/use-cases/cancel-subscription.use-case";
export { RecordPassPurchaseUseCase } from "./application/use-cases/record-pass-purchase.use-case";
export type { RecordPassPurchaseCommand } from "./application/use-cases/record-pass-purchase.use-case";
export { ConsumePassForTenderUseCase } from "./application/use-cases/consume-pass-for-tender.use-case";
export type { ConsumePassForTenderCommand } from "./application/use-cases/consume-pass-for-tender.use-case";
export { ListPassPurchasesUseCase } from "./application/use-cases/list-pass-purchases.use-case";
export { GetOrganizationEntitlementsUseCase } from "./application/use-cases/get-organization-entitlements.use-case";
export type { OrganizationEntitlementsSnapshot } from "./application/use-cases/get-organization-entitlements.use-case";
// V2 Sprint 22 (billing, étape 22B) — réexporté UNIQUEMENT pour `tenders` : point de choc unique
// de consommation "AO traité" identifié en `CreateTenderUseCase` (voir le rapport 22B), jamais un
// second point de consommation.
export { ConsumeAoCreditUseCase } from "./application/use-cases/consume-ao-credit.use-case";
export type { ConsumeAoCreditCommand } from "./application/use-cases/consume-ao-credit.use-case";
export { GrantMonthlyAoCreditsUseCase } from "./application/use-cases/grant-monthly-ao-credits.use-case";
export type { GrantMonthlyAoCreditsCommand } from "./application/use-cases/grant-monthly-ao-credits.use-case";
export { GetAoCreditBalanceUseCase } from "./application/use-cases/get-ao-credit-balance.use-case";
// V2 Sprint 22 (billing, étape 22D) — réexporté UNIQUEMENT pour `subscription-usage` (composition
// cross-module Chat/Documents/Memberships qui ne peut pas vivre DANS `billing` sans créer un cycle
// de modules Billing -> Chat -> Tenders -> Billing). Voir `subscription-usage.module.ts`.
export { GetOrganizationSubscriptionUseCase } from "./application/use-cases/get-organization-subscription.use-case";
export { BillingErrorFilter } from "./interfaces/http/billing-error.filter";
export { CheckQuotaThresholdUseCase } from "./application/use-cases/check-quota-threshold.use-case";
export type { CheckQuotaThresholdCommand } from "./application/use-cases/check-quota-threshold.use-case";
// V2 Sprint 22 (billing, étape 22E, correctif audit Codex P1-02 round 4) — `QuotaThresholdEventConsumersModule`
// n'est JAMAIS réexporté ici (contrairement à tout le reste de ce fichier) : il importe `ChatModule`/
// `DocumentsModule`, qui importent tous deux `TendersModule`, qui importe `BillingModule` via CE
// BARREL (`"../billing"`) — le réexporter ici refermerait un cycle de modules
// (billing/index.ts -> quota-threshold-event-consumers.module.ts -> chat -> tenders -> billing/index.ts),
// détecté avant exécution en retraçant le graphe d'imports, pas seulement en compilant. `app.module.ts`
// l'importe donc DIRECTEMENT depuis son fichier concret
// (`./modules/billing/quota-threshold-event-consumers.module`), jamais via ce barrel.
