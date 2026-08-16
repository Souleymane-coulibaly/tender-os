import { Inject, Injectable } from "@nestjs/common";
import type { BillingInterval } from "../../domain/billing-interval";
import { PlanTier, type SubscriptionPlanTier } from "../../domain/plan-tier";
import { resolveStripePassPriceId, resolveStripeSubscriptionPriceId } from "../../domain/stripe-price-registry";
import { STARTER_TRIAL_DAYS } from "../../domain/trial-policy";
import { assertCanManageBilling } from "../policies/assert-can-manage-billing";
import { appBillingReturnUrls, type CheckoutReturnTarget } from "../services/app-return-urls";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY, type OrganizationSubscriptionRepository } from "../ports/organization-subscription.repository";
import { STRIPE_CLIENT, type StripeCheckoutSession, type StripeClient } from "../ports/stripe-client";

export type CreateCheckoutSessionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  /** Simple pré-remplissage Stripe Checkout quand connu — jamais requis (Stripe le demande
   *  lui-même sur sa page hébergée si absent), jamais une source d'identité. */
  actorEmail?: string | undefined;
  /** Jamais un prix/Price ID envoyé par le client — uniquement le choix métier, résolu côté
   *  backend (mission anti price-tampering). */
  target: Readonly<{ kind: "PASS" }> | Readonly<{ kind: "SUBSCRIPTION"; planTier: SubscriptionPlanTier; billingInterval: BillingInterval }>;
  /** V2 Sprint 24 (onboarding) — "onboarding" fait revenir Stripe sur l'étape "Paiement" du
   *  wizard plutôt que sur l'écran Abonnement classique ; absent = comportement inchangé. */
  returnTarget?: CheckoutReturnTarget | undefined;
}>;

/**
 * V2 Sprint 22 (billing, étape 22C) — mode Stripe résolu par le TYPE d'achat, jamais par un champ
 * fourni par le client (mission §3/§20 "Pass = paiement unique, jamais un abonnement déguisé") :
 * `payment` pour PASS, `subscription` pour un palier. `organizationId` embarqué dans les métadonnées
 * Stripe (session + `subscription_data.metadata` pour les abonnements) — c'est la SEULE façon
 * fiable de retrouver l'organisation TenderOS depuis un événement webhook, jamais déduit d'un champ
 * utilisateur.
 *
 * Correctif audit Codex 22C (P1-03) — `successUrl`/`cancelUrl` ne sont PLUS des paramètres de la
 * commande : un open redirect via une URL Stripe de retour arbitraire fournie par le client aurait
 * permis à n'importe quel OWNER/ORGANIZATION_ADMIN de rediriger un paiement vers un domaine
 * externe. Toujours résolues côté serveur (`appBillingReturnUrls`), même motif que
 * `ConnectorsOAuthCallbackController` ("cette URL de redirection finale est TOUJOURS APP_BASE_URL +
 * un chemin fixe, jamais construite depuis une valeur de la requête entrante").
 */
@Injectable()
export class CreateCheckoutSessionUseCase {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripeClient: StripeClient,
    @Inject(ORGANIZATION_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: OrganizationSubscriptionRepository,
  ) {}

  async execute(command: CreateCheckoutSessionCommand): Promise<StripeCheckoutSession> {
    assertCanManageBilling(command.actorRole);

    const existingSubscription = await this.subscriptionRepository.findByOrganizationId(command.organizationId);
    const stripeCustomerId = existingSubscription?.toProps().stripeCustomerId;
    const { successUrl, cancelUrl } = appBillingReturnUrls(command.returnTarget);

    if (command.target.kind === "PASS") {
      return this.stripeClient.createCheckoutSession({
        mode: "payment",
        priceId: resolveStripePassPriceId(),
        organizationId: command.organizationId,
        stripeCustomerId,
        customerEmail: stripeCustomerId ? undefined : command.actorEmail,
        successUrl,
        cancelUrl,
      });
    }

    // V2 Sprint 25 (Trial Starter) — mission §2/§11 : UNIQUEMENT Starter, et UNIQUEMENT si
    // l'organisation n'a JAMAIS eu de ligne OrganizationSubscription (au plus un Trial par
    // organisation ; changer l'email du propriétaire n'y change rien, mission §12 — l'éligibilité
    // n'est jamais dérivée d'un email/cookie/stockage navigateur, seulement de cette preuve
    // serveur). Une organisation qui a déjà eu N'IMPORTE QUEL abonnement (même un Starter déjà
    // résilié) n'est plus éligible : le checkout se poursuit normalement, sans Trial.
    const isEligibleForStarterTrial = command.target.planTier === PlanTier.Starter && !existingSubscription;
    const trialPeriodDays = isEligibleForStarterTrial ? STARTER_TRIAL_DAYS : undefined;

    // Correctif audit Codex Checkpoint 25A (P1-001) — `!existingSubscription` ci-dessus ne protège
    // QUE contre un second Trial une fois la subscription locale créée par le webhook Stripe : deux
    // appels réellement simultanés de ce use case pour la même organisation passent TOUS LES DEUX
    // ce contrôle (aucune ligne locale n'existe encore pour l'un ou l'autre). Une clé d'idempotence
    // Stripe stable et scopée à l'organisation (jamais au plan/intervalle — l'invariant voulu est
    // "au plus une tentative de Checkout Trial en vol par organisation", pas par variante) fait
    // collapser deux appels concurrents sur UNE SEULE Checkout Session Stripe, jamais deux
    // abonnements Trial distincts. Uniquement appliquée quand un Trial est effectivement en jeu :
    // un achat normal (non-Trial) n'a pas ce risque, et Stripe rejette une réutilisation de clé avec
    // des paramètres différents.
    const idempotencyKey = isEligibleForStarterTrial ? `trial-starter-checkout:${command.organizationId}` : undefined;

    return this.stripeClient.createCheckoutSession({
      mode: "subscription",
      priceId: resolveStripeSubscriptionPriceId(command.target.planTier, command.target.billingInterval),
      organizationId: command.organizationId,
      stripeCustomerId,
      customerEmail: stripeCustomerId ? undefined : command.actorEmail,
      successUrl,
      cancelUrl,
      trialPeriodDays,
      idempotencyKey,
    });
  }
}
