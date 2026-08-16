/** Même motif que `presentOverride` (billing/interfaces/http/entitlement-overrides.controller.ts) —
 *  un agrégat de domaine n'est jamais retourné tel quel (propriétés privées, non sérialisables par
 *  `JSON.stringify`), toujours projeté explicitement via `.toProps()`. */
export function presentSubscription(subscription: { toProps(): Record<string, unknown> }) {
  const props = subscription.toProps();
  return {
    id: props.id,
    organizationId: props.organizationId,
    planTier: props.planTier,
    billingInterval: props.billingInterval,
    status: props.status,
    source: props.source,
    stripeCustomerId: props.stripeCustomerId ?? null,
    stripeSubscriptionId: props.stripeSubscriptionId ?? null,
    currentPeriodStart: props.currentPeriodStart ?? null,
    currentPeriodEnd: props.currentPeriodEnd ?? null,
    canceledAt: props.canceledAt ?? null,
    // V2 Sprint 25 (Trial Starter) — correctif : absent de ce présentateur depuis l'ajout du champ
    // domaine (Checkpoint 25A), jamais exposé via HTTP jusqu'ici. Sans lui, AUCUNE surface
    // authentifiée (bannière Trial du Dashboard, écran Abonnement) ne peut afficher "X jours
    // restants" malgré un statut TRIALING correctement propagé.
    trialEndsAt: props.trialEndsAt ?? null,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
  };
}

export function presentPassPurchase(purchase: { toProps(): Record<string, unknown> }) {
  const props = purchase.toProps();
  return {
    id: props.id,
    organizationId: props.organizationId,
    status: props.status,
    externalReference: props.externalReference,
    priceCents: props.priceCents,
    currency: props.currency,
    purchasedAt: props.purchasedAt,
    expiresAt: props.expiresAt ?? null,
    consumedTenderId: props.consumedTenderId ?? null,
    consumedAt: props.consumedAt ?? null,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
  };
}
