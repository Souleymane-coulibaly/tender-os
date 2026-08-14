import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseFilters, UseGuards } from "@nestjs/common";
import {
  AssignSubscriptionUseCase,
  BillingErrorFilter,
  GetOrganizationEntitlementsUseCase,
  GetOrganizationSubscriptionUseCase,
  ListPassPurchasesUseCase,
  type BillingInterval,
  type PlanSource,
  type SubscriptionPlanTier,
} from "../../../billing";
import { AuthenticatedGuard } from "../../../identity";
import { assertHasCapability, CurrentPlatformContext, PlatformAccessGuard, PlatformCapability, type PlatformContext } from "../../../platform-administration";
import { GetOrganizationUsageUseCase } from "../../application/use-cases/get-organization-usage.use-case";
import { presentPassPurchase, presentSubscription } from "./presenters";
import {
  AssignManualSubscriptionBodySchema,
  ListPassPurchasesQuerySchema,
  OrganizationIdParamSchema,
  type AssignManualSubscriptionBody,
  type ListPassPurchasesQuery,
} from "./schemas";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";

/**
 * V2 Sprint 22 (billing, étape 22D) — mission §46/§47/§49 "Platform Admin → Organisations →
 * Abonnement & Usage". Les use cases réutilisés ici (`GetOrganizationSubscriptionUseCase`,
 * `GetOrganizationEntitlementsUseCase`, `ListPassPurchasesUseCase`, `AssignSubscriptionUseCase`)
 * sont partagés avec l'écran self-service (`SubscriptionUsageController`) et ne connaissent donc
 * pas la notion de `PlatformRole` : la capacité fine (SUPPORT lecture seule, ADMIN/OWNER
 * assignation) est vérifiée ICI, dans le contrôleur, même motif que `AoCreditLedgerController.
 * getBalance` (Sprint 22B) pour `GetAoCreditBalanceUseCase`.
 */
@Controller("admin/organizations/:organizationId/billing")
@UseFilters(BillingErrorFilter)
@UseGuards(AuthenticatedGuard, PlatformAccessGuard)
export class AdminOrganizationBillingController {
  constructor(
    private readonly getOrganizationSubscriptionUseCase: GetOrganizationSubscriptionUseCase,
    private readonly getOrganizationEntitlementsUseCase: GetOrganizationEntitlementsUseCase,
    private readonly listPassPurchasesUseCase: ListPassPurchasesUseCase,
    private readonly getOrganizationUsageUseCase: GetOrganizationUsageUseCase,
    private readonly assignSubscriptionUseCase: AssignSubscriptionUseCase,
  ) {}

  @Get("subscription")
  @HttpCode(HttpStatus.OK)
  async getSubscription(
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Param("organizationId", new ZodValidationPipe(OrganizationIdParamSchema)) organizationId: string,
  ) {
    assertHasCapability(platformContext.role, PlatformCapability.SubscriptionsRead);
    // Correctif (régression réelle trouvée en HTTP réel, voir `SubscriptionUsageController`) —
    // toujours une enveloppe `{ subscription: ... | null }`, jamais une valeur nue potentiellement
    // `null` (NestJS renvoie un corps VIDE, pas le JSON littéral `null`, ce qui casse
    // `platformApiFetch`).
    const subscription = await this.getOrganizationSubscriptionUseCase.execute(organizationId);
    return { subscription: subscription ? presentSubscription(subscription) : null };
  }

  @Get("entitlements")
  @HttpCode(HttpStatus.OK)
  async getEntitlements(
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Param("organizationId", new ZodValidationPipe(OrganizationIdParamSchema)) organizationId: string,
  ) {
    assertHasCapability(platformContext.role, PlatformCapability.SubscriptionsRead);
    return this.getOrganizationEntitlementsUseCase.execute(organizationId);
  }

  @Get("pass-purchases")
  @HttpCode(HttpStatus.OK)
  async listPassPurchases(
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Param("organizationId", new ZodValidationPipe(OrganizationIdParamSchema)) organizationId: string,
    @Query(new ZodValidationPipe(ListPassPurchasesQuerySchema)) query: ListPassPurchasesQuery,
  ) {
    assertHasCapability(platformContext.role, PlatformCapability.SubscriptionsRead);
    const page = await this.listPassPurchasesUseCase.execute({ organizationId, cursor: query.cursor, limit: query.limit });
    return { items: page.items.map(presentPassPurchase), nextCursor: page.nextCursor };
  }

  @Get("usage")
  @HttpCode(HttpStatus.OK)
  async getUsage(
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Param("organizationId", new ZodValidationPipe(OrganizationIdParamSchema)) organizationId: string,
  ) {
    assertHasCapability(platformContext.role, PlatformCapability.SubscriptionsRead);
    return this.getOrganizationUsageUseCase.execute({ organizationId, now: new Date() });
  }

  @Post("assign-plan")
  @HttpCode(HttpStatus.OK)
  async assignPlan(
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Param("organizationId", new ZodValidationPipe(OrganizationIdParamSchema)) organizationId: string,
    @Body(new ZodValidationPipe(AssignManualSubscriptionBodySchema)) body: AssignManualSubscriptionBody,
  ) {
    assertHasCapability(platformContext.role, PlatformCapability.SubscriptionsManage);
    const subscription = await this.assignSubscriptionUseCase.execute({
      organizationId,
      planTier: body.planTier as SubscriptionPlanTier,
      billingInterval: body.billingInterval as BillingInterval,
      source: body.source as PlanSource,
      actorId: platformContext.administratorId,
      occurredAt: new Date(),
    });
    return presentSubscription(subscription);
  }
}
