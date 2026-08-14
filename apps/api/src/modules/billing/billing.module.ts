import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { PlatformAdministrationModule } from "../platform-administration";
import { AO_CREDIT_LEDGER_REPOSITORY } from "./application/ports/ao-credit-ledger.repository";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { ENTITLEMENT_OVERRIDE_REPOSITORY } from "./application/ports/entitlement-override.repository";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY } from "./application/ports/organization-subscription.repository";
import { PASS_PURCHASE_REPOSITORY } from "./application/ports/pass-purchase.repository";
import { DefaultEntitlementService, ENTITLEMENT_SERVICE } from "./application/services/entitlement.service";
import { AdjustAoCreditsUseCase } from "./application/use-cases/adjust-ao-credits.use-case";
import { AssignSubscriptionUseCase } from "./application/use-cases/assign-subscription.use-case";
import { CancelSubscriptionUseCase } from "./application/use-cases/cancel-subscription.use-case";
import { ConsumeAoCreditUseCase } from "./application/use-cases/consume-ao-credit.use-case";
import { ConsumePassForTenderUseCase } from "./application/use-cases/consume-pass-for-tender.use-case";
import { CreateEntitlementOverrideUseCase } from "./application/use-cases/create-entitlement-override.use-case";
import { GetAoCreditBalanceUseCase } from "./application/use-cases/get-ao-credit-balance.use-case";
import { GetOrganizationEntitlementsUseCase } from "./application/use-cases/get-organization-entitlements.use-case";
import { GrantMonthlyAoCreditsUseCase } from "./application/use-cases/grant-monthly-ao-credits.use-case";
import { ListAoCreditLedgerUseCase } from "./application/use-cases/list-ao-credit-ledger.use-case";
import { ListEntitlementOverridesUseCase } from "./application/use-cases/list-entitlement-overrides.use-case";
import { ListPassPurchasesUseCase } from "./application/use-cases/list-pass-purchases.use-case";
import { RecordPassPurchaseUseCase } from "./application/use-cases/record-pass-purchase.use-case";
import { ReverseAoCreditConsumptionUseCase } from "./application/use-cases/reverse-ao-credit-consumption.use-case";
import { RevokeEntitlementOverrideUseCase } from "./application/use-cases/revoke-entitlement-override.use-case";
import { PrismaAoCreditLedgerRepository } from "./infrastructure/prisma-ao-credit-ledger.repository";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaEntitlementOverrideRepository } from "./infrastructure/prisma-entitlement-override.repository";
import { PrismaOrganizationSubscriptionRepository } from "./infrastructure/prisma-organization-subscription.repository";
import { PrismaPassPurchaseRepository } from "./infrastructure/prisma-pass-purchase.repository";
import { AoCreditLedgerController } from "./interfaces/http/ao-credit-ledger.controller";
import { EntitlementOverridesController } from "./interfaces/http/entitlement-overrides.controller";

/**
 * V2 Sprint 22 (billing) — bounded context "Catalogue / Pass / Plans / Entitlements" (22A) +
 * "AO Credit Ledger / Rollover / Quotas" (22B). Importe `IdentityModule`/`PlatformAdministrationModule`
 * UNIQUEMENT pour réutiliser `AuthenticatedGuard`/`PlatformAccessGuard` sur ses contrôleurs Platform
 * Admin — jamais l'inverse. Les intégrations réelles restantes (déclenchement Stripe, écran
 * Platform Admin "Abonnement & Usage", planification du grant mensuel) sont des étapes ultérieures
 * (22C-22E) qui importeront `BillingModule` et consommeront ses exports.
 */
@Module({
  imports: [IdentityModule, PlatformAdministrationModule],
  controllers: [EntitlementOverridesController, AoCreditLedgerController],
  providers: [
    AssignSubscriptionUseCase,
    CancelSubscriptionUseCase,
    RecordPassPurchaseUseCase,
    ConsumePassForTenderUseCase,
    ListPassPurchasesUseCase,
    GetOrganizationEntitlementsUseCase,
    CreateEntitlementOverrideUseCase,
    RevokeEntitlementOverrideUseCase,
    ListEntitlementOverridesUseCase,
    ConsumeAoCreditUseCase,
    GrantMonthlyAoCreditsUseCase,
    AdjustAoCreditsUseCase,
    ReverseAoCreditConsumptionUseCase,
    GetAoCreditBalanceUseCase,
    ListAoCreditLedgerUseCase,

    { provide: ORGANIZATION_SUBSCRIPTION_REPOSITORY, useClass: PrismaOrganizationSubscriptionRepository },
    { provide: PASS_PURCHASE_REPOSITORY, useClass: PrismaPassPurchaseRepository },
    { provide: ENTITLEMENT_OVERRIDE_REPOSITORY, useClass: PrismaEntitlementOverrideRepository },
    { provide: AO_CREDIT_LEDGER_REPOSITORY, useClass: PrismaAoCreditLedgerRepository },
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
    // V2 Sprint 22B — réexporté pour que `tenders` consomme la consommation d'AO au point de
    // choc unique identifié (CreateTenderUseCase, voir le rapport 22B).
    ConsumeAoCreditUseCase,
    GrantMonthlyAoCreditsUseCase,
    GetAoCreditBalanceUseCase,
  ],
})
export class BillingModule {}
