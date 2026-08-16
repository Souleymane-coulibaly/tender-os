export type StripeCheckoutMode = "payment" | "subscription";

export type CreateStripeCheckoutSessionInput = Readonly<{
  mode: StripeCheckoutMode;
  priceId: string;
  organizationId: string;
  /** Réutilisé si connu (abonnement déjà existant) — sinon Stripe crée un nouveau Customer. */
  stripeCustomerId?: string | undefined;
  customerEmail?: string | undefined;
  successUrl: string;
  cancelUrl: string;
  /** V2 Sprint 25 (Trial Starter) — mission §7/§8 : uniquement `mode: "subscription"`. Résolu côté
   *  backend (`STARTER_TRIAL_DAYS`, jamais un nombre fourni par le client) UNIQUEMENT quand
   *  l'organisation est éligible (mission §11, jamais plus d'un Trial). La collecte de la carte
   *  reste TOUJOURS obligatoire (mission §8/§9) — voir `stripe-sdk.client.ts`, qui force
   *  `payment_method_collection: "always"` et annule le Trial si la carte n'a jamais été
   *  enregistrée, plutôt que de l'activer artificiellement. */
  trialPeriodDays?: number | undefined;
  /** Correctif audit Codex Checkpoint 25A (P1-001) — `existingSubscription === null` ne protège
   *  QUE contre un second Trial une fois la subscription locale créée par le webhook Stripe, jamais
   *  contre deux `CreateCheckoutSessionUseCase.execute()` réellement concurrents (aucune ligne
   *  locale n'existe encore pour l'un ou l'autre appel). La clé d'idempotence Stripe (stable, scopée
   *  organisation) est LA protection réelle sous concurrence : deux appels simultanés avec la même
   *  clé n'aboutissent jamais qu'à une seule Checkout Session côté Stripe (Stripe fait lui-même
   *  patienter le second appel puis renvoie la réponse du premier), jamais deux abonnements Trial
   *  distincts pour la même organisation. */
  idempotencyKey?: string | undefined;
}>;

export type StripeCheckoutSession = Readonly<{ sessionId: string; url: string }>;

export type StripeWebhookEvent = Readonly<{
  id: string;
  type: string;
  /** Payload désérialisé — typé `unknown` ici volontairement : chaque handler d'événement
   *  (application/use-cases/handle-stripe-webhook.use-case.ts) affine lui-même la forme attendue
   *  pour SON type d'événement, jamais une interface Stripe complète recopiée dans ce port. */
  data: unknown;
}>;

/**
 * V2 Sprint 22 (billing, étape 22C) — port dédié, jamais le SDK Stripe importé directement en
 * dehors de `infrastructure/stripe-sdk.client.ts`. Le prix (`priceId`) est TOUJOURS résolu par le
 * backend (`domain/stripe-price-registry.ts`) avant d'atteindre ce port — jamais un montant/devise
 * transmis par le client HTTP (mission anti price-tampering).
 */
export interface StripeClient {
  createCheckoutSession(input: CreateStripeCheckoutSessionInput): Promise<StripeCheckoutSession>;
  createCustomerPortalSession(input: { stripeCustomerId: string; returnUrl: string }): Promise<{ url: string }>;
  /** Vérifie la signature cryptographique du corps BRUT — jamais confiance dans le JSON déjà
   *  désérialisé par un `@Body()` classique (même motif que `SignatureWebhookVerifierPort`,
   *  module `signature`). Lève `StripeWebhookSignatureInvalidError` si invalide. */
  constructWebhookEvent(rawBody: Buffer, signatureHeader: string): StripeWebhookEvent;
}

export const STRIPE_CLIENT = Symbol("STRIPE_CLIENT");
