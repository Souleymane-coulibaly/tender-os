import { Injectable } from "@nestjs/common";
import type { OutboxEventHandler, OutboxEventToDispatch } from "../../../outbox";
import {
  buildLowAoCreditBalanceEmail,
  buildPassConsumedForTenderEmail,
  buildPassPurchaseConfirmedEmail,
  buildQuotaThresholdReachedEmail,
  buildSubscriptionCanceledEmail,
  buildSubscriptionPaymentFailedEmail,
  buildSubscriptionPlanChangedEmail,
} from "./billing-notification-templates";
import { BillingEventNotificationService } from "./billing-event-notification.service";

function baseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

function subscriptionLink(): string {
  return `${baseUrl()}/app/subscription`;
}

function tenderWorkspaceLink(tenderId: string): string {
  return `${baseUrl()}/app/tenders/${tenderId}/workspace`;
}

/** Mission §53 "solde devient faible... éviter le spam" — voir `ConsumeAoCreditUseCase` : cet
 *  événement n'est émis QU'aux paliers 2/1/0, jamais à chaque consommation. */
@Injectable()
export class AoCreditBalanceLowNotificationOutboxHandler implements OutboxEventHandler {
  readonly eventType = "AoCreditBalanceLow";
  constructor(private readonly service: BillingEventNotificationService) {}

  async handle(event: OutboxEventToDispatch): Promise<void> {
    const payload = event.payload as { balance?: unknown };
    if (typeof payload.balance !== "number") return;
    const link = subscriptionLink();
    const email = buildLowAoCreditBalanceEmail(payload.balance, link);
    await this.service.notifyOrganizationBillingManagers({
      organizationId: event.organizationId,
      type: "BILLING_AO_CREDIT_BALANCE_LOW",
      title: email.subject,
      targetUrl: link,
      metadata: { balance: payload.balance },
      emailSubject: email.subject,
      emailHtml: email.html,
      emailText: email.text,
    });
  }
}

@Injectable()
export class PassPurchaseConfirmedNotificationOutboxHandler implements OutboxEventHandler {
  readonly eventType = "PassPurchaseConfirmed";
  constructor(private readonly service: BillingEventNotificationService) {}

  async handle(event: OutboxEventToDispatch): Promise<void> {
    const link = subscriptionLink();
    const email = buildPassPurchaseConfirmedEmail(link);
    await this.service.notifyOrganizationBillingManagers({
      organizationId: event.organizationId,
      type: "BILLING_PASS_PURCHASE_CONFIRMED",
      title: email.subject,
      targetUrl: link,
      metadata: { passPurchaseId: event.aggregateId },
      emailSubject: email.subject,
      emailHtml: email.html,
      emailText: email.text,
    });
  }
}

@Injectable()
export class PassConsumedForTenderNotificationOutboxHandler implements OutboxEventHandler {
  readonly eventType = "PassConsumedForTender";
  constructor(private readonly service: BillingEventNotificationService) {}

  async handle(event: OutboxEventToDispatch): Promise<void> {
    const payload = event.payload as { tenderId?: unknown; actorId?: unknown };
    if (typeof payload.tenderId !== "string" || typeof payload.actorId !== "string") return;
    const link = tenderWorkspaceLink(payload.tenderId);
    const email = buildPassConsumedForTenderEmail(link);
    await this.service.notifyUser({
      organizationId: event.organizationId,
      userId: payload.actorId,
      type: "BILLING_PASS_CONSUMED_FOR_TENDER",
      title: email.subject,
      targetUrl: link,
      metadata: { tenderId: payload.tenderId, passPurchaseId: event.aggregateId },
      emailSubject: email.subject,
      emailHtml: email.html,
      emailText: email.text,
    });
  }
}

@Injectable()
export class SubscriptionPaymentFailedNotificationOutboxHandler implements OutboxEventHandler {
  readonly eventType = "SubscriptionPaymentFailed";
  constructor(private readonly service: BillingEventNotificationService) {}

  async handle(event: OutboxEventToDispatch): Promise<void> {
    const link = subscriptionLink();
    const email = buildSubscriptionPaymentFailedEmail(link);
    await this.service.notifyOrganizationBillingManagers({
      organizationId: event.organizationId,
      type: "BILLING_SUBSCRIPTION_PAYMENT_FAILED",
      title: email.subject,
      targetUrl: link,
      metadata: { subscriptionId: event.aggregateId },
      emailSubject: email.subject,
      emailHtml: email.html,
      emailText: email.text,
    });
  }
}

@Injectable()
export class SubscriptionPlanChangedNotificationOutboxHandler implements OutboxEventHandler {
  readonly eventType = "SubscriptionPlanChanged";
  constructor(private readonly service: BillingEventNotificationService) {}

  async handle(event: OutboxEventToDispatch): Promise<void> {
    const payload = event.payload as { fromPlanTier?: unknown; toPlanTier?: unknown };
    if (typeof payload.fromPlanTier !== "string" || typeof payload.toPlanTier !== "string") return;
    const link = subscriptionLink();
    const email = buildSubscriptionPlanChangedEmail(payload.fromPlanTier, payload.toPlanTier, link);
    await this.service.notifyOrganizationBillingManagers({
      organizationId: event.organizationId,
      type: "BILLING_SUBSCRIPTION_PLAN_CHANGED",
      title: email.subject,
      targetUrl: link,
      metadata: { fromPlanTier: payload.fromPlanTier, toPlanTier: payload.toPlanTier, subscriptionId: event.aggregateId },
      emailSubject: email.subject,
      emailHtml: email.html,
      emailText: email.text,
    });
  }
}

/** Correctif audit Codex 22E (P1-03) — mission §54 "annulation programmée", jamais câblé jusqu'ici
 *  (`CancelSubscriptionUseCase` auditait sans émettre d'événement). Déclenché par
 *  `customer.subscription.deleted` (webhook Stripe) : aucun acteur org-member évident, mêmes
 *  destinataires que `SubscriptionPlanChanged`. */
@Injectable()
export class SubscriptionCanceledNotificationOutboxHandler implements OutboxEventHandler {
  readonly eventType = "SubscriptionCanceled";
  constructor(private readonly service: BillingEventNotificationService) {}

  async handle(event: OutboxEventToDispatch): Promise<void> {
    const link = subscriptionLink();
    const email = buildSubscriptionCanceledEmail(link);
    await this.service.notifyOrganizationBillingManagers({
      organizationId: event.organizationId,
      type: "BILLING_SUBSCRIPTION_CANCELED",
      title: email.subject,
      targetUrl: link,
      metadata: { subscriptionId: event.aggregateId },
      emailSubject: email.subject,
      emailHtml: email.html,
      emailText: email.text,
    });
  }
}

/** Correctif audit Codex 22E (P1-02) — mission "alertes de seuil 80%/100% (users/Chat IA/stockage)".
 *  Émis par `CheckQuotaThresholdUseCase` (module `billing`, dédup par contrainte unique réelle) —
 *  déclenché DEPUIS le point d'écriture réel de chaque dimension (ajout de membre/message Chat IA/
 *  version de document, via `QuotaThresholdEventConsumersModule`), JAMAIS depuis une lecture
 *  `GET /billing/usage` (correctif round 4 : la simple consultation de l'écran par n'importe quel
 *  membre ne doit jamais créer de notification) — mêmes destinataires que les autres alertes
 *  billing organisation-wide. */
@Injectable()
export class QuotaThresholdReachedNotificationOutboxHandler implements OutboxEventHandler {
  readonly eventType = "QuotaThresholdReached";
  constructor(private readonly service: BillingEventNotificationService) {}

  async handle(event: OutboxEventToDispatch): Promise<void> {
    const payload = event.payload as { quotaType?: unknown; threshold?: unknown; used?: unknown; limit?: unknown };
    if (typeof payload.quotaType !== "string" || typeof payload.threshold !== "number") return;
    const link = subscriptionLink();
    const email = buildQuotaThresholdReachedEmail(payload.quotaType, payload.threshold, link);
    await this.service.notifyOrganizationBillingManagers({
      organizationId: event.organizationId,
      type: "BILLING_QUOTA_THRESHOLD_REACHED",
      title: email.subject,
      targetUrl: link,
      metadata: { quotaType: payload.quotaType, threshold: payload.threshold, used: payload.used, limit: payload.limit },
      emailSubject: email.subject,
      emailHtml: email.html,
      emailText: email.text,
    });
  }
}
