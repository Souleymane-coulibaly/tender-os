import type { WebhookSubscription as WebhookSubscriptionRow } from "@prisma/client";
import { WebhookSubscription } from "../domain/webhook-subscription.entity";
import type { WebhookSubscriptionStatus } from "../domain/enums";

export function toDomainWebhookSubscription(row: WebhookSubscriptionRow): WebhookSubscription {
  return WebhookSubscription.rehydrate({
    id: row.id,
    organizationId: row.organizationId,
    endpointUrl: row.endpointUrl,
    description: row.description ?? undefined,
    events: row.events,
    secret: row.secret,
    status: row.status as WebhookSubscriptionStatus,
    allowedClientAccountIds: row.allowedClientAccountIds,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? undefined,
  });
}

export function toWebhookSubscriptionRow(subscription: WebhookSubscription): WebhookSubscriptionRow {
  return {
    id: subscription.id,
    organizationId: subscription.organizationId,
    endpointUrl: subscription.endpointUrl,
    description: subscription.description ?? null,
    events: [...subscription.events],
    secret: subscription.secret,
    status: subscription.status,
    allowedClientAccountIds: [...subscription.allowedClientAccountIds],
    createdBy: subscription.createdBy,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
    deletedAt: subscription.deletedAt ?? null,
  };
}
