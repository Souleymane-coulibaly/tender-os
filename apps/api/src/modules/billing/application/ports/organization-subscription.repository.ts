import type { OrganizationSubscription } from "../../domain/organization-subscription.aggregate";

/**
 * V2 Sprint 22 (billing, étape 22A) — au plus une ligne par organisation (contrainte `@unique` en
 * base). `save` fait un upsert (création à la première assignation, mise à jour ensuite) — jamais
 * deux méthodes distinctes create/update ici, l'agrégat lui-même encode déjà la seule transition
 * possible (une organisation n'a jamais deux abonnements).
 */
export interface OrganizationSubscriptionRepository {
  findByOrganizationId(organizationId: string): Promise<OrganizationSubscription | null>;
  save(subscription: OrganizationSubscription): Promise<void>;
}

export const ORGANIZATION_SUBSCRIPTION_REPOSITORY = Symbol("ORGANIZATION_SUBSCRIPTION_REPOSITORY");
