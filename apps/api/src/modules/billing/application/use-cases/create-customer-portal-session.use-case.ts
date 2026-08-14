import { Inject, Injectable } from "@nestjs/common";
import { NoStripeCustomerForOrganizationError } from "../../domain/errors";
import { assertCanManageBilling } from "../policies/assert-can-manage-billing";
import { appCustomerPortalReturnUrl } from "../services/app-return-urls";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY, type OrganizationSubscriptionRepository } from "../ports/organization-subscription.repository";
import { STRIPE_CLIENT, type StripeClient } from "../ports/stripe-client";

export type CreateCustomerPortalSessionCommand = Readonly<{ organizationId: string; actorRole: string }>;

/**
 * V2 Sprint 22 (billing, étape 22C) — mission "Customer Portal pour les abonnements uniquement,
 * jamais forcé sur le Pass" : refuse explicitement si l'organisation n'a pas de `stripeCustomerId`
 * réel (Pass uniquement, ou aucun plan) plutôt que d'ouvrir un Portal vide/erroné.
 *
 * Correctif audit Codex 22C (P1-03) — `returnUrl` n'est plus un paramètre de la commande, même
 * motif que `CreateCheckoutSessionUseCase` (open redirect).
 */
@Injectable()
export class CreateCustomerPortalSessionUseCase {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripeClient: StripeClient,
    @Inject(ORGANIZATION_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: OrganizationSubscriptionRepository,
  ) {}

  async execute(command: CreateCustomerPortalSessionCommand): Promise<{ url: string }> {
    assertCanManageBilling(command.actorRole);

    const subscription = await this.subscriptionRepository.findByOrganizationId(command.organizationId);
    const stripeCustomerId = subscription?.toProps().stripeCustomerId;
    if (!stripeCustomerId) {
      throw new NoStripeCustomerForOrganizationError(command.organizationId);
    }

    return this.stripeClient.createCustomerPortalSession({ stripeCustomerId, returnUrl: appCustomerPortalReturnUrl() });
  }
}
