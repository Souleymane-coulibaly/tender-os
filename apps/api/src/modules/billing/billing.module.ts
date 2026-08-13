import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { PlatformAdministrationModule } from "../platform-administration";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { ENTITLEMENT_OVERRIDE_REPOSITORY } from "./application/ports/entitlement-override.repository";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY } from "./application/ports/organization-subscription.repository";
import { PASS_PURCHASE_REPOSITORY } from "./application/ports/pass-purchase.repository";
import { DefaultEntitlementService, ENTITLEMENT_SERVICE } from "./application/services/entitlement.service";
import { AssignSubscriptionUseCase } from "./application/use-cases/assign-subscription.use-case";
import { CancelSubscriptionUseCase } from "./application/use-cases/cancel-subscription.use-case";
import { ConsumePassForTenderUseCase } from "./application/use-cases/consume-pass-for-tender.use-case";
import { CreateEntitlementOverrideUseCase } from "./application/use-cases/create-entitlement-override.use-case";
import { GetOrganizationEntitlementsUseCase } from "./application/use-cases/get-organization-entitlements.use-case";
import { ListEntitlementOverridesUseCase } from "./application/use-cases/list-entitlement-overrides.use-case";
import { ListPassPurchasesUseCase } from "./application/use-cases/list-pass-purchases.use-case";
import { RecordPassPurchaseUseCase } from "./application/use-cases/record-pass-purchase.use-case";
import { RevokeEntitlementOverrideUseCase } from "./application/use-cases/revoke-entitlement-override.use-case";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaEntitlementOverrideRepository } from "./infrastructure/prisma-entitlement-override.repository";
import { PrismaOrganizationSubscriptionRepository } from "./infrastructure/prisma-organization-subscription.repository";
import { PrismaPassPurchaseRepository } from "./infrastructure/prisma-pass-purchase.repository";
import { EntitlementOverridesController } from "./interfaces/http/entitlement-overrides.controller";

/**
 * V2 Sprint 22 (billing, étape 22A) — nouveau bounded context "Catalogue / Pass / Plans /
 * Entitlements". Importe `IdentityModule`/`PlatformAdministrationModule` UNIQUEMENT pour
 * réutiliser `AuthenticatedGuard`/`PlatformAccessGuard` sur `EntitlementOverridesController`
 * (correctif audit Codex P1-02) — jamais l'inverse (`PlatformAdministrationModule` n'importe
 * jamais `billing`). Les intégrations réelles (déclenchement Stripe, écran Platform Admin
 * "Abonnement & Usage", gating cross-module via `EntitlementService` dans le reste des modules
 * différenciants) restent des étapes ultérieures (22B-22E) qui importeront `BillingModule` et
 * consommeront ses exports.
 */
@Module({
  imports: [IdentityModule, PlatformAdministrationModule],
  controllers: [EntitlementOverridesController],
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

    { provide: ORGANIZATION_SUBSCRIPTION_REPOSITORY, useClass: PrismaOrganizationSubscriptionRepository },
    { provide: PASS_PURCHASE_REPOSITORY, useClass: PrismaPassPurchaseRepository },
    { provide: ENTITLEMENT_OVERRIDE_REPOSITORY, useClass: PrismaEntitlementOverrideRepository },
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
  ],
})
export class BillingModule {}
