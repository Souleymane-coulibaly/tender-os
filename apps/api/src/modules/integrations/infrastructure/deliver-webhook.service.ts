import { lookup } from "node:dns/promises";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../shared-kernel/clock";
import { isDisallowedWebhookHost } from "../domain/services/webhook-url-safety";
import { signWebhookPayload, WEBHOOK_HEADERS } from "../domain/services/webhook-signature";
import type { WebhookDelivery } from "../domain/webhook-delivery.entity";
import type { WebhookSubscription } from "../domain/webhook-subscription.entity";
import { WEBHOOK_DELIVERY_REPOSITORY, type WebhookDeliveryRepository } from "../application/ports/webhook-delivery.repository";
import { WEBHOOK_SUBSCRIPTION_REPOSITORY, type WebhookSubscriptionRepository } from "../application/ports/webhook-subscription.repository";

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Mission §27/§28/§29/§31/§92/§93/§94 — envoi HTTP réel d'UNE delivery déjà claimée par le
 * worker. Jamais appelé depuis une transaction métier (mission §92/§93/§94 "failure/latency
 * isolation") : ce service ne vit que dans `WebhookDeliveryWorker` (infrastructure), en dehors de
 * toute requête utilisateur.
 */
@Injectable()
export class DeliverWebhookService {
  private readonly logger = new Logger(DeliverWebhookService.name);

  constructor(
    @Inject(WEBHOOK_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: WebhookSubscriptionRepository,
    @Inject(WEBHOOK_DELIVERY_REPOSITORY) private readonly deliveryRepository: WebhookDeliveryRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async deliver(delivery: WebhookDelivery): Promise<void> {
    const subscription = await this.subscriptionRepository.findById({ organizationId: delivery.organizationId, subscriptionId: delivery.subscriptionId });
    const now = this.clock.now();

    if (!subscription || !subscription.isEligibleForDelivery) {
      // Mission §57 — désabonné/désactivé/supprimé entre la mise en file et l'envoi : jamais
      // envoyé, jamais retenté indéfiniment.
      delivery.recordFailure({ isNetworkOrTimeoutError: false, httpStatus: undefined, errorSummary: "Subscription is disabled or no longer exists.", occurredAt: now });
      await this.deliveryRepository.save(delivery);
      return;
    }

    const ssrfCheck = await this.recheckEndpointSafety(subscription.endpointUrl);
    if (!ssrfCheck.safe) {
      // Mission §31/§95 — défense en profondeur DNS rebinding : jamais envoyé, jamais retenté
      // (l'URL elle-même est le problème, un retry ne le résoudra jamais).
      delivery.recordFailure({ isNetworkOrTimeoutError: false, httpStatus: undefined, errorSummary: `Endpoint became unsafe at delivery time: ${ssrfCheck.reason}`, occurredAt: now });
      await this.deliveryRepository.save(delivery);
      return;
    }

    const outcome = await this.sendSigned(subscription, delivery, now);

    if (outcome.kind === "success") {
      delivery.markSucceeded({ httpStatus: outcome.httpStatus, occurredAt: now });
    } else {
      delivery.recordFailure({ httpStatus: outcome.httpStatus, isNetworkOrTimeoutError: outcome.isNetworkOrTimeoutError, errorSummary: outcome.errorSummary, occurredAt: now });
    }
    await this.deliveryRepository.save(delivery);
  }

  /** Mission §29/§95 — revérifie l'IP RÉSOLUE (pas seulement le hostname littéral déjà validé à
   *  la création) juste avant l'envoi. Best-effort contre le DNS rebinding : ne protège pas contre
   *  un rebinding survenant entre CETTE résolution et la connexion TCP réelle de `fetch` (mission
   *  documente ce résidu, voir rapport Sprint 16 §"risques résiduels"). */
  private async recheckEndpointSafety(endpointUrl: string): Promise<{ safe: true } | { safe: false; reason: string }> {
    let url: URL;
    try {
      url = new URL(endpointUrl);
    } catch {
      return { safe: false, reason: "malformed URL" };
    }

    // Même échappatoire de test que `assertSafeWebhookEndpointUrl` (jamais activée en
    // production, toujours dérivée de `process.env`) — voir domain/services/webhook-url-safety.ts.
    if (process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS === "true") {
      return { safe: true };
    }

    if (isDisallowedWebhookHost(url.hostname)) {
      return { safe: false, reason: `host "${url.hostname}" is disallowed` };
    }

    try {
      const resolved = await lookup(url.hostname, { all: true });
      for (const entry of resolved) {
        if (isDisallowedWebhookHost(entry.address)) {
          return { safe: false, reason: `resolved address ${entry.address} is disallowed` };
        }
      }
    } catch (error) {
      return { safe: false, reason: `DNS resolution failed: ${error instanceof Error ? error.message : String(error)}` };
    }

    return { safe: true };
  }

  private async sendSigned(
    subscription: WebhookSubscription,
    delivery: WebhookDelivery,
    now: Date,
  ): Promise<{ kind: "success"; httpStatus: number } | { kind: "failure"; httpStatus?: number | undefined; isNetworkOrTimeoutError: boolean; errorSummary: string }> {
    const rawBody = JSON.stringify(delivery.payload);
    const timestampSeconds = Math.floor(now.getTime() / 1000);
    const signature = signWebhookPayload({ secret: subscription.secret, timestampSeconds, rawBody });

    try {
      const response = await fetch(subscription.endpointUrl, {
        method: "POST",
        // Audit Codex INT-P1-01 — SSRF via redirection : `recheckEndpointSafety` ne valide que
        // l'URL de destination déclarée, jamais une cible vers laquelle un endpoint public
        // contrôlé par un tiers pourrait rediriger (ex. 302 vers 169.254.169.254). `fetch` suit
        // les redirections par défaut ; `redirect: "manual"` l'en empêche complètement — TenderOS
        // ne suit JAMAIS une redirection webhook, quelle que soit sa cible. Vérifié empiriquement :
        // sous Node/undici, une réponse 3xx en mode `manual` reste directement lisible (`status`,
        // `ok`) — jamais un `opaqueredirect` opaque façon navigateur — donc `response.ok` est déjà
        // `false` pour toute redirection, qui tombe dans la branche `failure` normale ci-dessous ;
        // `isRetryableDeliveryOutcome` classe déjà tout statut < 500 (hors 429) comme non-retryable,
        // donc une redirection refusée passe directement en DEAD, sans code supplémentaire requis.
        redirect: "manual",
        headers: {
          "Content-Type": "application/json",
          [WEBHOOK_HEADERS.Event]: delivery.eventType,
          [WEBHOOK_HEADERS.Delivery]: delivery.id,
          [WEBHOOK_HEADERS.Timestamp]: String(timestampSeconds),
          [WEBHOOK_HEADERS.Signature]: signature,
        },
        body: rawBody,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.ok) {
        return { kind: "success", httpStatus: response.status };
      }
      return { kind: "failure", httpStatus: response.status, isNetworkOrTimeoutError: false, errorSummary: `HTTP ${response.status}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Webhook delivery ${delivery.id} network/timeout error: ${message}`);
      return { kind: "failure", isNetworkOrTimeoutError: true, errorSummary: message };
    }
  }
}
