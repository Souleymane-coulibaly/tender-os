import { Injectable, Logger } from "@nestjs/common";
import Stripe from "stripe";
import { StripeWebhookSignatureInvalidError } from "../domain/errors";
import type {
  CreatePlanChangePortalSessionInput,
  CreateStripeCheckoutSessionInput,
  StripeCheckoutSession,
  StripeClient,
  StripeSubscriptionSnapshot,
  StripeWebhookEvent,
} from "../application/ports/stripe-client";

/**
 * V2 Sprint 22 (billing, étape 22C) — seul point du repo qui importe le SDK `stripe` en dehors des
 * types du port lui-même (jamais fuité au-delà de cet adaptateur). `STRIPE_SECRET_KEY`/
 * `STRIPE_WEBHOOK_SECRET` absents ne font jamais échouer le DÉMARRAGE (même discipline que
 * `METRICS_TOKEN`, Sprint 21) — seule une tentative réelle d'appel Stripe échoue explicitement,
 * jamais silencieusement.
 *
 * Correctif (étape 22D, régression réelle trouvée en amorçant le graphe Nest complet pour la
 * première fois depuis 22C) — `stripe@22.5.0` valide `apiKey` DANS SON PROPRE constructeur
 * (`new Stripe("")` lève immédiatement `Error: Neither apiKey nor config.authenticator provided`,
 * contrairement à l'hypothèse du commentaire d'origine "rien n'appelle le réseau au démarrage").
 * Construire `Stripe` au DÉMARRAGE de ce provider (constructeur de `StripeSdkClient`, appelé
 * pendant l'instanciation du graphe Nest, jamais différée) faisait donc planter TOUT le démarrage
 * de l'application dès que `STRIPE_SECRET_KEY` était absent. Le client Stripe est maintenant
 * construit paresseusement (mémoïsé), au premier appel RÉEL d'une méthode de cette classe —
 * jamais pendant l'instanciation DI.
 */
@Injectable()
export class StripeSdkClient implements StripeClient {
  private readonly logger = new Logger(StripeSdkClient.name);
  private stripeInstance: Stripe | undefined;

  // Méthode plate, jamais un accesseur `get` (leçon retenue de `PrismaService` — un `get` sur un
  // provider Nest peut perdre la liaison `this` selon comment l'appelant y accède).
  private stripeClient(): Stripe {
    if (!this.stripeInstance) {
      this.stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", { apiVersion: "2026-07-29.dahlia" });
    }
    return this.stripeInstance;
  }

  async createCheckoutSession(input: CreateStripeCheckoutSessionInput): Promise<StripeCheckoutSession> {
    const session = await this.stripeClient().checkout.sessions.create(
      {
        mode: input.mode,
        line_items: [{ price: input.priceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        ...(input.stripeCustomerId ? { customer: input.stripeCustomerId } : input.customerEmail ? { customer_email: input.customerEmail } : {}),
        metadata: { organizationId: input.organizationId },
        ...(input.mode === "subscription"
          ? {
              subscription_data: {
                metadata: { organizationId: input.organizationId },
                ...(input.trialPeriodDays
                  ? {
                      trial_period_days: input.trialPeriodDays,
                      // Mission §8/§9 — carte bancaire OBLIGATOIRE au démarrage du Trial : sans moyen
                      // de paiement valide enregistré à la fin de l'essai, Stripe ANNULE la
                      // subscription plutôt que de la laisser continuer sans facturation possible
                      // (jamais un Trial "activé" sans carte réellement associée).
                      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
                    }
                  : {}),
              },
              // Mission §8 — la carte est collectée AVANT activation du Trial, jamais différée :
              // Stripe Checkout ne demande pas systématiquement de moyen de paiement pour une
              // subscription en Trial sauf demande explicite.
              ...(input.trialPeriodDays ? { payment_method_collection: "always" as const } : {}),
            }
          : {}),
      },
      // Correctif audit Codex Checkpoint 25A (P1-001) — options de requête Stripe (2e argument),
      // jamais un champ du corps de la requête : c'est la déduplication CÔTÉ STRIPE de deux appels
      // concurrents partageant la même clé (voir le commentaire sur `idempotencyKey` dans le port).
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
    );

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout Session URL");
    }
    return { sessionId: session.id, url: session.url };
  }

  async createCustomerPortalSession(input: { stripeCustomerId: string; returnUrl: string }): Promise<{ url: string }> {
    const session = await this.stripeClient().billingPortal.sessions.create({ customer: input.stripeCustomerId, return_url: input.returnUrl });
    return { url: session.url };
  }

  async retrieveSubscription(stripeSubscriptionId: string): Promise<StripeSubscriptionSnapshot | null> {
    try {
      const subscription = await this.stripeClient().subscriptions.retrieve(stripeSubscriptionId);
      return { status: subscription.status, items: subscription.items.data.map((item) => ({ id: item.id, priceId: item.price.id })) };
    } catch (error) {
      // Abonnement inconnu de Stripe (supprimé, autre compte ou autre mode) : une absence explicite,
      // que le cas d'usage traduit en erreur métier — jamais une 500.
      if ((error as { code?: string }).code === "resource_missing") return null;
      throw error;
    }
  }

  async createPlanChangePortalSession(input: CreatePlanChangePortalSessionInput): Promise<{ url: string }> {
    const session = await this.stripeClient().billingPortal.sessions.create({
      customer: input.stripeCustomerId,
      return_url: input.returnUrl,
      flow_data: {
        type: "subscription_update_confirm",
        subscription_update_confirm: {
          subscription: input.stripeSubscriptionId,
          items: [{ id: input.subscriptionItemId, price: input.priceId, quantity: 1 }],
        },
        after_completion: { type: "redirect", redirect: { return_url: input.returnUrl } },
      },
    });
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
      event = this.stripeClient().webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
    } catch {
      throw new StripeWebhookSignatureInvalidError();
    }

    return { id: event.id, type: event.type, data: event.data.object };
  }
}
