import type { WebhookSubscription } from "../../domain/webhook-subscription.entity";

export interface WebhookSubscriptionRepository {
  create(subscription: WebhookSubscription): Promise<void>;
  save(subscription: WebhookSubscription): Promise<void>;
  findById(input: { organizationId: string; subscriptionId: string }): Promise<WebhookSubscription | null>;
  listByOrganization(input: { organizationId: string }): Promise<readonly WebhookSubscription[]>;
  /** Utilisé par le handler Outbox (mission §21/§57) — uniquement les abonnements ACTIVE, jamais
   *  DISABLED/supprimés, jamais chargés en mémoire "tous puis filtrés" à grande échelle. */
  listActiveByOrganizationAndEventType(input: { organizationId: string; eventType: string }): Promise<readonly WebhookSubscription[]>;
}

export const WEBHOOK_SUBSCRIPTION_REPOSITORY = Symbol("WEBHOOK_SUBSCRIPTION_REPOSITORY");
