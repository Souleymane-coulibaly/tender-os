import { Inject, Injectable } from "@nestjs/common";
import type { BillingInterval } from "../../domain/billing-interval";
import {
  NoStripeCustomerForOrganizationError,
  PlanChangeTargetIsCurrentPlanError,
  StripeSubscriptionNotUpdatableError,
} from "../../domain/errors";
import type { SubscriptionPlanTier } from "../../domain/plan-tier";
import { resolveStripeSubscriptionPriceId } from "../../domain/stripe-price-registry";
import { SubscriptionStatus } from "../../domain/subscription-status";
import { assertCanManageBilling } from "../policies/assert-can-manage-billing";
import { appCustomerPortalReturnUrl } from "../services/app-return-urls";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY, type OrganizationSubscriptionRepository } from "../ports/organization-subscription.repository";
import { STRIPE_CLIENT, type StripeClient } from "../ports/stripe-client";

export type CreatePlanChangePortalSessionCommand = Readonly<{
  organizationId: string;
  actorRole: string;
  planTier: SubscriptionPlanTier;
  billingInterval: BillingInterval;
}>;

/** Statuts Stripe d'un abonnement qui ne peut plus être modifié. */
const NON_UPDATABLE_STRIPE_STATUSES = new Set(["canceled", "incomplete_expired"]);

/**
 * « Passer à Business » pour une organisation DÉJÀ abonnée : ouvre le portail Stripe directement
 * sur la confirmation du nouveau prix, au lieu de l'accueil générique du portail (qui n'affichait
 * que l'abonnement en cours). Jamais une seconde Checkout Session, qui créerait un second abonnement
 * Stripe. Le prix est résolu côté serveur (anti price-tampering, comme le checkout) ; le forfait
 * local n'est mis à jour que par le webhook `customer.subscription.updated`, une fois le changement
 * réellement confirmé chez Stripe — jamais ici.
 */
@Injectable()
export class CreatePlanChangePortalSessionUseCase {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripeClient: StripeClient,
    @Inject(ORGANIZATION_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: OrganizationSubscriptionRepository,
  ) {}

  async execute(command: CreatePlanChangePortalSessionCommand): Promise<{ url: string }> {
    assertCanManageBilling(command.actorRole);

    const subscription = (await this.subscriptionRepository.findByOrganizationId(command.organizationId))?.toProps();
    if (!subscription?.stripeCustomerId) {
      throw new NoStripeCustomerForOrganizationError(command.organizationId);
    }
    if (subscription.planTier === command.planTier && subscription.billingInterval === command.billingInterval) {
      throw new PlanChangeTargetIsCurrentPlanError(`${command.planTier}/${command.billingInterval}`);
    }
    // Avant tout appel réseau : une offre non configurée échoue explicitement, sans rien ouvrir.
    const priceId = resolveStripeSubscriptionPriceId(command.planTier, command.billingInterval);

    if (!subscription.stripeSubscriptionId || subscription.status === SubscriptionStatus.Canceled) {
      throw new StripeSubscriptionNotUpdatableError("no live Stripe subscription is linked to this organization");
    }
    const stripeSubscription = await this.stripeClient.retrieveSubscription(subscription.stripeSubscriptionId);
    if (!stripeSubscription) {
      throw new StripeSubscriptionNotUpdatableError(`unknown to Stripe (${subscription.stripeSubscriptionId})`);
    }
    if (NON_UPDATABLE_STRIPE_STATUSES.has(stripeSubscription.status)) {
      throw new StripeSubscriptionNotUpdatableError(`status ${stripeSubscription.status}`);
    }
    const [item, ...otherItems] = stripeSubscription.items;
    if (!item || otherItems.length > 0) {
      throw new StripeSubscriptionNotUpdatableError(`expected exactly one subscription item, found ${stripeSubscription.items.length}`);
    }

    return this.stripeClient.createPlanChangePortalSession({
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      subscriptionItemId: item.id,
      priceId,
      returnUrl: appCustomerPortalReturnUrl(),
    });
  }
}
