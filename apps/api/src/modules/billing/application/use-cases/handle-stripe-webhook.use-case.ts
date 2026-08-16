import { Inject, Injectable, Logger } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { resolvePlanFromStripePriceId } from "../../domain/stripe-price-registry";
import { PlanSource } from "../../domain/plan-source";
import { SubscriptionStatus } from "../../domain/subscription-status";
import { StripeUnrecognizedPriceError } from "../../domain/errors";
import { AssignSubscriptionUseCase } from "./assign-subscription.use-case";
import { CancelSubscriptionUseCase } from "./cancel-subscription.use-case";
import { GrantMonthlyAoCreditsUseCase } from "./grant-monthly-ao-credits.use-case";
import { GrantTrialAoCreditUseCase } from "./grant-trial-ao-credit.use-case";
import { MarkSubscriptionPastDueUseCase } from "./mark-subscription-past-due.use-case";
import { RecordPassPurchaseUseCase } from "./record-pass-purchase.use-case";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY, type OrganizationSubscriptionRepository } from "../ports/organization-subscription.repository";
import { STRIPE_CLIENT, type StripeClient } from "../ports/stripe-client";
import { STRIPE_PROCESSED_EVENT_REPOSITORY, type StripeProcessedEventRepository } from "../ports/stripe-processed-event.repository";

export type HandleStripeWebhookCommand = Readonly<{ rawBody: Buffer; signatureHeader: string }>;

/** Formes minimales lues depuis chaque type d'événement Stripe — jamais l'objet SDK complet recopié
 *  ici, uniquement les champs stables et documentés que ce use case consomme réellement. */
type StripeCheckoutSessionPayload = {
  id: string;
  mode: "payment" | "subscription" | "setup";
  metadata?: Record<string, string> | null;
};
type StripeSubscriptionPayload = {
  id: string;
  customer: string;
  status: string;
  items: { data: Array<{ price: { id: string } }> };
  current_period_start: number;
  current_period_end: number;
  /** V2 Sprint 25 (Trial Starter) — `null` hors Trial, fin de période d'essai (Unix seconds) sinon. */
  trial_end: number | null;
  metadata?: Record<string, string> | null;
};
type StripeInvoicePayload = {
  subscription: string | null;
  period_start: number;
};

function periodOf(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** V2 Sprint 25 (Trial Starter) — mission §23 "jamais marquer ACTIVE artificiellement" : tout
 *  statut Stripe qui n'est ni "trialing" ni "active" retombe sur PAST_DUE (jamais un défaut
 *  optimiste), qu'il s'agisse d'un problème de paiement réel ("past_due"/"unpaid") ou d'un état
 *  transitoire d'intégration ("incomplete") — la seule alternative sûre à "n'accorde aucun accès
 *  entitlements" tout en restant un statut du domaine existant (CANCELED est réservé au webhook
 *  dédié `customer.subscription.deleted`, jamais deviné ici). */
function mapStripeSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
  if (stripeStatus === "trialing") return SubscriptionStatus.Trialing;
  if (stripeStatus === "active") return SubscriptionStatus.Active;
  return SubscriptionStatus.PastDue;
}

/**
 * V2 Sprint 22 (billing, étape 22C) — mission "idempotence webhook Stripe... P1 si possible" :
 * chaque événement est enregistré de façon idempotente (contrainte unique réelle,
 * `StripeProcessedEventRepository.recordForProcessing`, même motif que
 * `SignatureProviderEventRepository`) AVANT tout traitement métier — une livraison en double d'un
 * événement déjà `PROCESSED` est un no-op silencieux, jamais un second crédit/abonnement.
 *
 * Correctif audit Codex 22C (P1-01) — un événement précédemment `FAILED` reste REJOUABLE par le
 * prochain retry Stripe pour le MÊME `stripeEventId` (`recordForProcessing` renvoie `RETRY`), jamais
 * bloqué à jamais derrière la contrainte unique.
 *
 * `checkout.session.completed` (mode=payment) crédite le Pass. La création/mise à jour d'abonnement
 * est déclenchée par `customer.subscription.*` plutôt que par `checkout.session.completed`
 * (mode=subscription) : ces événements portent de façon fiable le prix/les dates de période, jamais
 * besoin d'étendre (`expand`) l'objet Session pour les obtenir.
 */
@Injectable()
export class HandleStripeWebhookUseCase {
  private readonly logger = new Logger(HandleStripeWebhookUseCase.name);

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripeClient: StripeClient,
    @Inject(STRIPE_PROCESSED_EVENT_REPOSITORY) private readonly processedEventRepository: StripeProcessedEventRepository,
    @Inject(ORGANIZATION_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: OrganizationSubscriptionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly recordPassPurchaseUseCase: RecordPassPurchaseUseCase,
    private readonly assignSubscriptionUseCase: AssignSubscriptionUseCase,
    private readonly cancelSubscriptionUseCase: CancelSubscriptionUseCase,
    private readonly grantMonthlyAoCreditsUseCase: GrantMonthlyAoCreditsUseCase,
    private readonly grantTrialAoCreditUseCase: GrantTrialAoCreditUseCase,
    private readonly markSubscriptionPastDueUseCase: MarkSubscriptionPastDueUseCase,
  ) {}

  async execute(command: HandleStripeWebhookCommand): Promise<void> {
    const event = this.stripeClient.constructWebhookEvent(command.rawBody, command.signatureHeader);
    const receivedAt = this.clock.now();
    const recordId = this.idGenerator.generate();

    const recordOutcome = await this.processedEventRepository.recordForProcessing({ id: recordId, stripeEventId: event.id, eventType: event.type, receivedAt });
    if (recordOutcome.outcome === "SKIP") {
      this.logger.log(`Duplicate Stripe webhook event ignored (id=${event.id}, type=${event.type}).`);
      return;
    }

    try {
      await this.dispatch(event.type, event.data);
      await this.processedEventRepository.markProcessed({ id: recordOutcome.recordId, occurredAt: this.clock.now() });
    } catch (error) {
      await this.processedEventRepository.markFailed({ id: recordOutcome.recordId, errorCode: error instanceof Error ? error.message : "UNKNOWN" });
      throw error;
    }
  }

  private async dispatch(eventType: string, data: unknown): Promise<void> {
    const occurredAt = this.clock.now();

    switch (eventType) {
      case "checkout.session.completed": {
        const session = data as StripeCheckoutSessionPayload;
        if (session.mode !== "payment") {
          return;
        }
        const organizationId = session.metadata?.organizationId;
        if (!organizationId) {
          this.logger.warn(`checkout.session.completed (payment) missing metadata.organizationId (session=${session.id}).`);
          return;
        }
        await this.recordPassPurchaseUseCase.execute({ organizationId, externalReference: session.id, actorId: "stripe-webhook", occurredAt });
        return;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = data as StripeSubscriptionPayload;
        const organizationId = subscription.metadata?.organizationId;
        if (!organizationId) {
          this.logger.warn(`${eventType} missing metadata.organizationId (subscription=${subscription.id}).`);
          return;
        }
        const priceId = subscription.items.data[0]?.price.id;
        const plan = priceId ? resolvePlanFromStripePriceId(priceId) : null;
        if (!plan) {
          // Correctif audit Codex 22C (P1-02) — jamais un succès silencieux : un Price non reconnu
          // (registre non déployé/désynchronisé) doit renvoyer un statut non-2xx à Stripe pour que
          // l'événement soit rejoué après correction, jamais un abonnement local qui reste
          // silencieusement divergent de Stripe pour toujours.
          throw new StripeUnrecognizedPriceError(priceId ?? "(missing)");
        }
        const status = mapStripeSubscriptionStatus(subscription.status);
        const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined;

        await this.assignSubscriptionUseCase.execute({
          organizationId,
          planTier: plan.planTier,
          billingInterval: plan.billingInterval,
          source: PlanSource.Stripe,
          stripeCustomerId: subscription.customer,
          stripeSubscriptionId: subscription.id,
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          status,
          trialEndsAt,
          actorId: "stripe-webhook",
          occurredAt,
        });

        // V2 Sprint 25 (Trial Starter) — mission §13/§16 : le Trial démarre à l'activation RÉELLE
        // de la Subscription (jamais au clic Landing/à un retour Checkout), et accorde exactement 1
        // crédit AO, idempotent quel que soit le nombre de fois où Stripe redélivre cet événement
        // pour la même organisation (mission §18 — `GrantTrialAoCreditUseCase`/`grantTrial` sont
        // eux-mêmes la seule autorité d'idempotence, jamais un `if` supplémentaire ici).
        if (status === SubscriptionStatus.Trialing) {
          await this.grantTrialAoCreditUseCase.execute({ organizationId, actorId: "stripe-webhook", occurredAt });
        }
        return;
      }

      case "customer.subscription.deleted": {
        const subscription = data as StripeSubscriptionPayload;
        const organizationId = subscription.metadata?.organizationId ?? (await this.resolveOrganizationIdBySubscription(subscription.id));
        if (!organizationId) {
          this.logger.warn(`customer.subscription.deleted for an unknown subscription (subscription=${subscription.id}).`);
          return;
        }
        await this.cancelSubscriptionUseCase.execute({ organizationId, actorId: "stripe-webhook", occurredAt });
        return;
      }

      case "invoice.paid": {
        const invoice = data as StripeInvoicePayload;
        if (!invoice.subscription) {
          // Facture hors abonnement (ex. Pass déjà traité via checkout.session.completed) — rien à
          // faire ici, jamais un second crédit.
          return;
        }
        const subscription = await this.subscriptionRepository.findByStripeSubscriptionId(invoice.subscription);
        if (!subscription) {
          this.logger.warn(`invoice.paid references an unknown subscription (subscription=${invoice.subscription}).`);
          return;
        }
        // Mission §17 — le grant reste mensuel même en facturation annuelle (jamais tout d'un
        // coup) : chaque `invoice.paid` (mensuelle OU l'unique facture annuelle initiale) déclenche
        // exactement un grant pour SON mois, l'idempotence par (organisation, mois) empêchant tout
        // double crédit sur un rejeu.
        await this.grantMonthlyAoCreditsUseCase.execute({
          organizationId: subscription.organizationId,
          period: periodOf(invoice.period_start),
          actorId: "stripe-webhook",
          occurredAt,
        });
        return;
      }

      case "invoice.payment_failed": {
        // Correctif (étape 22E) — jamais traité jusqu'ici malgré la mission §54 "paiement échoué" :
        // aucune bascule PAST_DUE ne se déclenchait réellement (voir `MarkSubscriptionPastDueUseCase`).
        const invoice = data as StripeInvoicePayload;
        if (!invoice.subscription) {
          return;
        }
        const subscription = await this.subscriptionRepository.findByStripeSubscriptionId(invoice.subscription);
        if (!subscription) {
          this.logger.warn(`invoice.payment_failed references an unknown subscription (subscription=${invoice.subscription}).`);
          return;
        }
        await this.markSubscriptionPastDueUseCase.execute({ organizationId: subscription.organizationId, occurredAt });
        return;
      }

      default:
        // Type non mappé — reçu et journalisé (idempotence déjà enregistrée ci-dessus), jamais fatal
        // (même motif que `HandleSignatureProviderEventUseCase`, module `signature`).
        return;
    }
  }

  private async resolveOrganizationIdBySubscription(stripeSubscriptionId: string): Promise<string | undefined> {
    const subscription = await this.subscriptionRepository.findByStripeSubscriptionId(stripeSubscriptionId);
    return subscription?.organizationId;
  }
}
