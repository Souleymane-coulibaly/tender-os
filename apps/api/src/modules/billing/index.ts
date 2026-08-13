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
export { EntitlementFeatureNotAvailableError } from "./domain/errors";

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
