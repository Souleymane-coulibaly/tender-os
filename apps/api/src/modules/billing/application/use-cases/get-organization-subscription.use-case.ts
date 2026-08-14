import { Inject, Injectable } from "@nestjs/common";
import type { OrganizationSubscription } from "../../domain/organization-subscription.aggregate";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY, type OrganizationSubscriptionRepository } from "../ports/organization-subscription.repository";

/**
 * V2 Sprint 22 (billing, étape 22D) — vue en LECTURE consommée par l'écran "Abonnement &
 * utilisation" (client) et Platform Admin "Organisations → Abonnement & Usage". Une organisation
 * sur Pass uniquement (jamais d'abonnement STARTER/BUSINESS/ENTERPRISE souscrit) n'a AUCUNE ligne
 * `OrganizationSubscription` : `null` est un résultat normal, jamais une erreur.
 */
@Injectable()
export class GetOrganizationSubscriptionUseCase {
  constructor(@Inject(ORGANIZATION_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: OrganizationSubscriptionRepository) {}

  async execute(organizationId: string): Promise<OrganizationSubscription | null> {
    return this.subscriptionRepository.findByOrganizationId(organizationId);
  }
}
