import { Injectable, Logger } from "@nestjs/common";
import Stripe from "stripe";
import { StripeWebhookSignatureInvalidError } from "../domain/errors";
import type {
  CreateStripeCheckoutSessionInput,
  StripeCheckoutSession,
  StripeClient,
  StripeWebhookEvent,
} from "../application/ports/stripe-client";

/**
 * V2 Sprint 22 (billing, étape 22C) — seul point du repo qui importe le SDK `stripe` en dehors des
 * types du port lui-même (jamais fuité au-delà de cet adaptateur). `STRIPE_SECRET_KEY`/
 * `STRIPE_WEBHOOK_SECRET` absents ne font jamais échouer le DÉMARRAGE (même discipline que
 * `METRICS_TOKEN`, Sprint 21) — seule une tentative réelle d'appel Stripe échoue explicitement,
 * jamais silencieusement.
 */
@Injectable()
export class StripeSdkClient implements StripeClient {
  private readonly logger = new Logger(StripeSdkClient.name);
  private readonly stripe: Stripe;

  constructor() {
    // Une clé absente reste un Stripe client valide en mémoire (rien n'appelle le réseau au
    // démarrage) — l'échec réel n'arrive qu'au premier appel HTTP, avec le message d'erreur
    // explicite du SDK Stripe lui-même.
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", { apiVersion: "2026-07-29.dahlia" });
  }

  async createCheckoutSession(input: CreateStripeCheckoutSessionInput): Promise<StripeCheckoutSession> {
    const session = await this.stripe.checkout.sessions.create({
      mode: input.mode,
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      ...(input.stripeCustomerId ? { customer: input.stripeCustomerId } : input.customerEmail ? { customer_email: input.customerEmail } : {}),
      metadata: { organizationId: input.organizationId },
      ...(input.mode === "subscription" ? { subscription_data: { metadata: { organizationId: input.organizationId } } } : {}),
    });

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout Session URL");
    }
    return { sessionId: session.id, url: session.url };
  }

  async createCustomerPortalSession(input: { stripeCustomerId: string; returnUrl: string }): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({ customer: input.stripeCustomerId, return_url: input.returnUrl });
    return { url: session.url };
  }

  constructWebhookEvent(rawBody: Buffer, signatureHeader: string): StripeWebhookEvent {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      // Mission — vérification de signature obligatoire, jamais un webhook accepté "en clair" même
      // en environnement mal configuré (contrairement à METRICS_TOKEN, un webhook de paiement non
      // vérifié est une brèche financière directe, jamais un simple compromis d'exploitation).
      this.logger.error("STRIPE_WEBHOOK_SECRET is not configured — refusing all Stripe webhooks.");
      throw new StripeWebhookSignatureInvalidError();
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
    } catch {
      throw new StripeWebhookSignatureInvalidError();
    }

    return { id: event.id, type: event.type, data: event.data.object };
  }
}
