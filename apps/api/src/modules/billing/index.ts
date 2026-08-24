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
export { EntitlementFeatureNotAvailableError, InsufficientAoCreditsError, TenderOperationNotEntitledError } from "./domain/errors";
export { AoCreditMovementType } from "./domain/ao-credit-movement-type";
export type { AoCreditLedgerEntry } from "./domain/ao-credit-ledger-entry";

export { ENTITLEMENT_SERVICE, DefaultEntitlementService } from "./application/services/entitlement.service";
export type { EntitlementService, EntitlementContext, TenderOperationEntitlementInput } from "./application/services/entitlement.service";
// V2 Sprint 22 (billing, étape 22A, correctif audit Codex P1-01) — réexporté pour que les modules
// différenciants (integrations, workspace, connectors...) gatent leurs points d'entrée sans
// dupliquer le "if (!allowed) throw" à chaque site d'appel.
export { assertEntitlementFeature } from "./application/policies/assert-entitlement-feature";
// Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 1 — même motif, pour les opérations "cœur AO"
// (DCE/Analyse/Mémoire technique/SubmissionPackage/Submission) : mécanisme UNIQUE réutilisé par ces
// cinq modules, jamais un `if (plan === ...)` local dupliqué à chaque point d'entrée.
export { assertTenderOperationEntitled } from "./application/policies/assert-tender-operation-entitled";
export { AssignSubscriptionUseCase } from "./application/use-cases/assign-subscription.use-case";
export type { AssignSubscriptionCommand } from "./application/use-cases/assign-subscription.use-case";
export { CancelSubscriptionUseCase } from "./application/use-cases/cancel-subscription.use-case";
export { RecordPassPurchaseUseCase } from "./application/use-cases/record-pass-purchase.use-case";
export type { RecordPassPurchaseCommand } from "./application/use-cases/record-pass-purchase.use-case";
export { ConsumePassForTenderUseCase } from "./application/use-cases/consume-pass-for-tender.use-case";
export type { ConsumePassForTenderCommand } from "./application/use-cases/consume-pass-for-tender.use-case";
// Checkpoint TENDEROS-2.1-P2.3-E1.4 — réexporté pour `tenders` (`AbandonTenderUseCase`), mission
// §7/§8 "réutiliser ReleasePassForTenderUseCase, ne pas créer un second moteur".
export { ReleasePassForTenderUseCase } from "./application/use-cases/release-pass-for-tender.use-case";
export type { ReleasePassForTenderCommand, ReleasePassForTenderReason } from "./application/use-cases/release-pass-for-tender.use-case";
// Checkpoint TENDEROS-2.1-P2.3-E1.4 — réexporté pour les tests unitaires d'autres modules qui
// prouvent la réservation/compensation Pass RÉELLE (jamais un mock simulé) contre leur propre gate
// `runTenderOperationEntitled`, même motif que `entitlement.service.spec.ts`.
export { ReservePassForTenderUseCase } from "./application/use-cases/reserve-pass-for-tender.use-case";
export type { ReservePassForTenderCommand } from "./application/use-cases/reserve-pass-for-tender.use-case";
export { ListPassPurchasesUseCase } from "./application/use-cases/list-pass-purchases.use-case";
export { GetOrganizationEntitlementsUseCase } from "./application/use-cases/get-organization-entitlements.use-case";
export type { OrganizationEntitlementsSnapshot } from "./application/use-cases/get-organization-entitlements.use-case";
// V2 Sprint 22 (billing, étape 22B) ; relocalisé Checkpoint P2.3-E1.1 FINDING 4 — réexporté pour
// `submission` (`RecordTenderSubmissionUseCase`) : point de choc unique de consommation "AO traité",
// désormais le premier `TenderSubmission` réussi (jamais `CreateTenderUseCase`, voir son commentaire
// de classe), jamais un second point de consommation.
export { ConsumeAoCreditUseCase } from "./application/use-cases/consume-ao-credit.use-case";
export type { ConsumeAoCreditCommand } from "./application/use-cases/consume-ao-credit.use-case";
export { GrantMonthlyAoCreditsUseCase } from "./application/use-cases/grant-monthly-ao-credits.use-case";
export type { GrantMonthlyAoCreditsCommand } from "./application/use-cases/grant-monthly-ao-credits.use-case";
export { GetAoCreditBalanceUseCase } from "./application/use-cases/get-ao-credit-balance.use-case";
// Checkpoint TENDEROS-2.1-P2.3-E9 — réexporté pour `subscription-usage` (mission §56, historique
// des crédits AO self-service), même motif que `GetOrganizationEntitlementsUseCase` ci-dessus.
export { ListOrganizationAoCreditLedgerUseCase } from "./application/use-cases/list-organization-ao-credit-ledger.use-case";
export type { ListOrganizationAoCreditLedgerQuery } from "./application/use-cases/list-organization-ao-credit-ledger.use-case";
export type { AoCreditLedgerPage } from "./application/ports/ao-credit-ledger.repository";
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
