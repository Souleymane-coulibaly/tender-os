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
