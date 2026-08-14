import { Body, Controller, HttpCode, HttpStatus, Post, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { BillingInterval } from "../../domain/billing-interval";
import type { SubscriptionPlanTier } from "../../domain/plan-tier";
import { CreateCheckoutSessionUseCase } from "../../application/use-cases/create-checkout-session.use-case";
import { CreateCustomerPortalSessionUseCase } from "../../application/use-cases/create-customer-portal-session.use-case";
import { BillingErrorFilter } from "./billing-error.filter";
import { CreateCheckoutSessionBodySchema, type CreateCheckoutSessionBody } from "./schemas";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";

/**
 * V2 Sprint 22 (billing, étape 22C) — mission "seul OWNER/ORGANIZATION_ADMIN peut engager la carte
 * bancaire de l'organisation" (`assertCanManageBilling`, appelé DANS chaque use case, jamais
 * seulement au niveau du contrôleur). Correctif audit Codex P1-03 : les URLs de retour ne sont
 * JAMAIS acceptées depuis le body (open redirect) — toujours résolues côté serveur.
 */
@Controller("billing")
@UseFilters(BillingErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class CheckoutController {
  constructor(
    private readonly createCheckoutSessionUseCase: CreateCheckoutSessionUseCase,
    private readonly createCustomerPortalSessionUseCase: CreateCustomerPortalSessionUseCase,
  ) {}

  @Post("checkout-sessions")
  @HttpCode(HttpStatus.CREATED)
  async createCheckoutSession(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateCheckoutSessionBodySchema)) body: CreateCheckoutSessionBody,
  ) {
    const target =
      body.target.kind === "PASS"
        ? ({ kind: "PASS" } as const)
        : ({ kind: "SUBSCRIPTION" as const, planTier: body.target.planTier as SubscriptionPlanTier, billingInterval: body.target.billingInterval as BillingInterval });

    return this.createCheckoutSessionUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      target,
    });
  }

  @Post("customer-portal-sessions")
  @HttpCode(HttpStatus.CREATED)
  async createCustomerPortalSession(@CurrentMembershipContext() membership: MembershipContext) {
    return this.createCustomerPortalSessionUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role });
  }
}
