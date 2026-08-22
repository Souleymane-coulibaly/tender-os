import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { OutboxWriterModule } from "../outbox";
import { PlatformAdministrationModule } from "../platform-administration";
import { AO_CREDIT_LEDGER_REPOSITORY } from "./application/ports/ao-credit-ledger.repository";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { ENTITLEMENT_OVERRIDE_REPOSITORY } from "./application/ports/entitlement-override.repository";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY } from "./application/ports/organization-subscription.repository";
import { PASS_PURCHASE_REPOSITORY } from "./application/ports/pass-purchase.repository";
import { QUOTA_ALERT_REPOSITORY } from "./application/ports/quota-alert.repository";
import { STRIPE_CLIENT } from "./application/ports/stripe-client";
import { STRIPE_PROCESSED_EVENT_REPOSITORY } from "./application/ports/stripe-processed-event.repository";
import { TRIAL_REMINDER_REPOSITORY } from "./application/ports/trial-reminder.repository";
import { DefaultEntitlementService, ENTITLEMENT_SERVICE } from "./application/services/entitlement.service";
import { AdjustAoCreditsUseCase } from "./application/use-cases/adjust-ao-credits.use-case";
import { AssignSubscriptionUseCase } from "./application/use-cases/assign-subscription.use-case";
import { CancelSubscriptionUseCase } from "./application/use-cases/cancel-subscription.use-case";
import { CheckQuotaThresholdUseCase } from "./application/use-cases/check-quota-threshold.use-case";
import { ConsumeAoCreditUseCase } from "./application/use-cases/consume-ao-credit.use-case";
import { ConsumePassForTenderUseCase } from "./application/use-cases/consume-pass-for-tender.use-case";
import { CreateCheckoutSessionUseCase } from "./application/use-cases/create-checkout-session.use-case";
import { CreateCustomerPortalSessionUseCase } from "./application/use-cases/create-customer-portal-session.use-case";
import { CreateEntitlementOverrideUseCase } from "./application/use-cases/create-entitlement-override.use-case";
import { GetAoCreditBalanceUseCase } from "./application/use-cases/get-ao-credit-balance.use-case";
import { GetOrganizationEntitlementsUseCase } from "./application/use-cases/get-organization-entitlements.use-case";
import { GetOrganizationSubscriptionUseCase } from "./application/use-cases/get-organization-subscription.use-case";
import { GetPublicPlanCatalogUseCase } from "./application/use-cases/get-public-plan-catalog.use-case";
import { GrantMonthlyAoCreditsUseCase } from "./application/use-cases/grant-monthly-ao-credits.use-case";
import { GrantMonthlyAoCreditsForYearlySubscriptionsUseCase } from "./application/use-cases/grant-monthly-ao-credits-for-yearly-subscriptions.use-case";
import { GrantTrialAoCreditUseCase } from "./application/use-cases/grant-trial-ao-credit.use-case";
import { HandleStripeWebhookUseCase } from "./application/use-cases/handle-stripe-webhook.use-case";
import { ListAoCreditLedgerUseCase } from "./application/use-cases/list-ao-credit-ledger.use-case";
import { ListEntitlementOverridesUseCase } from "./application/use-cases/list-entitlement-overrides.use-case";
import { ListPassPurchasesUseCase } from "./application/use-cases/list-pass-purchases.use-case";
import { MarkSubscriptionPastDueUseCase } from "./application/use-cases/mark-subscription-past-due.use-case";
import { RecordPassPurchaseUseCase } from "./application/use-cases/record-pass-purchase.use-case";
import { ReleasePassForTenderUseCase } from "./application/use-cases/release-pass-for-tender.use-case";
import { ReservePassForTenderUseCase } from "./application/use-cases/reserve-pass-for-tender.use-case";
import { ReverseAoCreditConsumptionUseCase } from "./application/use-cases/reverse-ao-credit-consumption.use-case";
import { RevokeEntitlementOverrideUseCase } from "./application/use-cases/revoke-entitlement-override.use-case";
import { SendTrialRemindersUseCase } from "./application/use-cases/send-trial-reminders.use-case";
import { PrismaAoCreditLedgerRepository } from "./infrastructure/prisma-ao-credit-ledger.repository";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaEntitlementOverrideRepository } from "./infrastructure/prisma-entitlement-override.repository";
import { PrismaOrganizationSubscriptionRepository } from "./infrastructure/prisma-organization-subscription.repository";
import { PrismaPassPurchaseRepository } from "./infrastructure/prisma-pass-purchase.repository";
import { PrismaQuotaAlertRepository } from "./infrastructure/prisma-quota-alert.repository";
import { PrismaStripeProcessedEventRepository } from "./infrastructure/prisma-stripe-processed-event.repository";
import { PrismaTrialReminderRepository } from "./infrastructure/prisma-trial-reminder.repository";
import { StripeSdkClient } from "./infrastructure/stripe-sdk.client";
import { TrialReminderWorker } from "./infrastructure/trial-reminder.worker";
import { MonthlyAoCreditGrantWorker } from "./infrastructure/monthly-ao-credit-grant.worker";
import { AoCreditLedgerController } from "./interfaces/http/ao-credit-ledger.controller";
import { CheckoutController } from "./interfaces/http/checkout.controller";
import { EntitlementOverridesController } from "./interfaces/http/entitlement-overrides.controller";
import { PlanCatalogController } from "./interfaces/http/plan-catalog.controller";
import { StripeWebhookController } from "./interfaces/http/stripe-webhook.controller";

/**
 * V2 Sprint 22 (billing) — bounded context "Catalogue / Pass / Plans / Entitlements" (22A) +
 * "AO Credit Ledger / Rollover / Quotas" (22B) + "Stripe Payment + Subscriptions" (22C) +
 * "Subscription & Usage UI + Platform Admin" (22D, lecture propre — la composition avec les
 * usages Chat IA/stockage/utilisateurs vit dans le module `subscription-usage`, jamais ici, pour
 * éviter un cycle de modules Billing -> Chat -> Tenders -> Billing) + "Alertes de seuil d'usage"
 * (22E, correctif audit Codex round 3 : `CheckQuotaThresholdUseCase` vit ICI et est réexporté —
 * `memberships`/`chat`/`documents` en dépendent déjà tous, jamais l'inverse, donc aucun cycle ;
 * chaque module déclenche la vérification depuis SON PROPRE point d'écriture réel, jamais depuis
 * une lecture `GET /billing/usage`). Importe `IdentityModule`/`MembershipsModule`/
 * `PlatformAdministrationModule` UNIQUEMENT pour réutiliser leurs guards/décorateurs sur ses propres
 * contrôleurs — jamais l'inverse.
 *
 * V2 Sprint 23 (landing) — `PlanCatalogController`/`GetPublicPlanCatalogUseCase` : SEULE route
 * publique (sans `@UseGuards`, même motif que `StripeWebhookController`) de ce module — la Landing
 * Page tarifs lit `PLAN_CATALOG` sans dupliquer les prix/quotas côté frontend (mission §17/§55).
 */
@Module({
  imports: [IdentityModule, MembershipsModule, PlatformAdministrationModule, OutboxWriterModule],
  controllers: [EntitlementOverridesController, AoCreditLedgerController, CheckoutController, StripeWebhookController, PlanCatalogController],
  providers: [
    AssignSubscriptionUseCase,
    CancelSubscriptionUseCase,
    MarkSubscriptionPastDueUseCase,
    CheckQuotaThresholdUseCase,
    GetPublicPlanCatalogUseCase,
    RecordPassPurchaseUseCase,
    ConsumePassForTenderUseCase,
    ReservePassForTenderUseCase,
    ReleasePassForTenderUseCase,
    ListPassPurchasesUseCase,
    GetOrganizationEntitlementsUseCase,
    GetOrganizationSubscriptionUseCase,
    CreateEntitlementOverrideUseCase,
    RevokeEntitlementOverrideUseCase,
    ListEntitlementOverridesUseCase,
    ConsumeAoCreditUseCase,
    GrantMonthlyAoCreditsUseCase,
    GrantTrialAoCreditUseCase,
    AdjustAoCreditsUseCase,
    ReverseAoCreditConsumptionUseCase,
    GetAoCreditBalanceUseCase,
    ListAoCreditLedgerUseCase,
    CreateCheckoutSessionUseCase,
    CreateCustomerPortalSessionUseCase,
    HandleStripeWebhookUseCase,
    SendTrialRemindersUseCase,
    TrialReminderWorker,
    GrantMonthlyAoCreditsForYearlySubscriptionsUseCase,
    MonthlyAoCreditGrantWorker,

    { provide: ORGANIZATION_SUBSCRIPTION_REPOSITORY, useClass: PrismaOrganizationSubscriptionRepository },
    { provide: PASS_PURCHASE_REPOSITORY, useClass: PrismaPassPurchaseRepository },
    { provide: ENTITLEMENT_OVERRIDE_REPOSITORY, useClass: PrismaEntitlementOverrideRepository },
    { provide: AO_CREDIT_LEDGER_REPOSITORY, useClass: PrismaAoCreditLedgerRepository },
    { provide: STRIPE_PROCESSED_EVENT_REPOSITORY, useClass: PrismaStripeProcessedEventRepository },
    { provide: QUOTA_ALERT_REPOSITORY, useClass: PrismaQuotaAlertRepository },
    { provide: TRIAL_REMINDER_REPOSITORY, useClass: PrismaTrialReminderRepository },
    { provide: STRIPE_CLIENT, useClass: StripeSdkClient },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    { provide: ENTITLEMENT_SERVICE, useClass: DefaultEntitlementService },
  ],
  exports: [
    ENTITLEMENT_SERVICE,
    AssignSubscriptionUseCase,
    CancelSubscriptionUseCase,
    RecordPassPurchaseUseCase,
    ConsumePassForTenderUseCase,
    ListPassPurchasesUseCase,
    GetOrganizationEntitlementsUseCase,
    GetOrganizationSubscriptionUseCase,
    // V2 Sprint 22B — réexporté pour que `tenders` consomme la consommation d'AO au point de
    // choc unique identifié (CreateTenderUseCase, voir le rapport 22B).
    ConsumeAoCreditUseCase,
    GrantMonthlyAoCreditsUseCase,
    GetAoCreditBalanceUseCase,
    // Checkpoint TENDEROS-2.1-P2.3-E1.4 — réexporté pour `tenders` (`AbandonTenderUseCase`, mission
    // §7/§8 "action explicite d'abandon", réutilise ce SEUL mécanisme de libération, jamais un
    // second moteur).
    ReleasePassForTenderUseCase,
    // V2 Sprint 22E (correctif audit Codex P1-02, round 3) — réexporté pour que `memberships`/
    // `chat`/`documents` déclenchent la vérification de seuil depuis leur propre point d'écriture
    // réel (jamais depuis une lecture) : ces trois modules dépendent déjà de `billing`, jamais
    // l'inverse, donc aucun cycle.
    CheckQuotaThresholdUseCase,
  ],
})
export class BillingModule {}
