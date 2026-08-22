import type { OrganizationSubscription } from "../../domain/organization-subscription.aggregate";

/**
 * V2 Sprint 22 (billing, étape 22A) — au plus une ligne par organisation (contrainte `@unique` en
 * base). `save` fait un upsert (création à la première assignation, mise à jour ensuite) — jamais
 * deux méthodes distinctes create/update ici, l'agrégat lui-même encode déjà la seule transition
 * possible (une organisation n'a jamais deux abonnements).
 */
export interface OrganizationSubscriptionRepository {
  findByOrganizationId(organizationId: string): Promise<OrganizationSubscription | null>;
  /** V2 Sprint 22C — un événement webhook `invoice.paid` ne porte pas de façon fiable les
   *  métadonnées TenderOS (contrairement à `Subscription.metadata`, propagées depuis
   *  `subscription_data.metadata` au checkout) : seule façon robuste de retrouver l'organisation. */
  findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<OrganizationSubscription | null>;
  save(subscription: OrganizationSubscription): Promise<void>;
  /** V2 Sprint 25 (Trial Starter) — pour `SendTrialRemindersUseCase` (worker) : toutes les
   *  organisations actuellement en essai, jamais un filtrage par date fait ici (le calcul de
   *  jours restants reste dans le domaine/use case, cette méthode ne fait que lister le statut). */
  listTrialing(): Promise<OrganizationSubscription[]>;
  /** Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 2 — pour `GrantMonthlyAoCreditsForYearlySubscriptionsUseCase`
   *  (worker) : les abonnements annuels ACTIVE/TRIALING sont les seuls concernés par ce mécanisme
   *  (Stripe ne produit normalement PAS 12 `invoice.paid` mensuels pour un abonnement annuel — voir
   *  le rapport d'audit). Même discipline que `listTrialing` : aucun filtrage supplémentaire ici. */
  listActiveOrTrialingYearly(): Promise<OrganizationSubscription[]>;
}

export const ORGANIZATION_SUBSCRIPTION_REPOSITORY = Symbol("ORGANIZATION_SUBSCRIPTION_REPOSITORY");
