import { InvalidSubscriptionStatusError } from "./errors";

/**
 * V2 Sprint 22 (billing, étape 22A). ACTIVE est le seul statut qui accorde des entitlements
 * (`EntitlementService`, mission — un abonnement PAST_DUE ou CANCELED ne doit jamais rester
 * silencieusement actif). PAST_DUE existe dès 22A (colonne + statut) mais sa bascule réelle depuis
 * un événement Stripe `invoice.payment_failed` est livrée en 22C ; ce module ne fait ici que
 * respecter le statut tel qu'il est, jamais le calculer depuis un état de paiement externe.
 *
 * V2 Sprint 25 (Trial Starter) — TRIALING ajouté : une vraie Subscription Stripe en essai (mission
 * §7 "ne jamais créer un faux Trial uniquement dans PostgreSQL"), synchronisée par webhook comme
 * tout autre statut. `OrganizationSubscription.isEntitled` (jamais `isActive`, qui reste strictement
 * ACTIVE) traite TRIALING comme donnant droit aux entitlements Starter — voir l'agrégat.
 */
export const SubscriptionStatus = {
  Active: "ACTIVE",
  Trialing: "TRIALING",
  PastDue: "PAST_DUE",
  Canceled: "CANCELED",
} as const;

export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return Object.values(SubscriptionStatus).includes(value as SubscriptionStatus);
}

export function parseSubscriptionStatus(value: string): SubscriptionStatus {
  if (!isSubscriptionStatus(value)) {
    throw new InvalidSubscriptionStatusError(value);
  }
  return value;
}
