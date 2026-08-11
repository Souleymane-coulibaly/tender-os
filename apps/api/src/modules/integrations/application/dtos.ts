import type { ApiKey } from "../domain/api-key.entity";
import type { ApiKeyScope } from "../domain/enums";
import type { WebhookDelivery } from "../domain/webhook-delivery.entity";
import type { WebhookSubscription } from "../domain/webhook-subscription.entity";

/** Mission §11/§98 — jamais `keyHash`, jamais le secret complet. */
export type ApiKeySummary = Readonly<{
  id: string;
  name: string;
  keyPrefix: string;
  scopes: readonly ApiKeyScope[];
  allowedClientAccountIds: readonly string[];
  createdBy: string;
  createdAt: string;
  lastUsedAt?: string | undefined;
  expiresAt?: string | undefined;
  revokedAt?: string | undefined;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
}>;

export function toApiKeySummary(key: ApiKey, now: Date): ApiKeySummary {
  const status = key.revokedAt !== undefined ? "REVOKED" : key.expiresAt !== undefined && key.expiresAt.getTime() <= now.getTime() ? "EXPIRED" : "ACTIVE";
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes,
    allowedClientAccountIds: key.allowedClientAccountIds,
    createdBy: key.createdBy,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString(),
    expiresAt: key.expiresAt?.toISOString(),
    revokedAt: key.revokedAt?.toISOString(),
    status,
  };
}

/** Mission §30 — jamais `secret` sauf au moment exact de la création (voir
 *  `CreateWebhookSubscriptionUseCase`, résultat séparé). */
export type WebhookSubscriptionSummary = Readonly<{
  id: string;
  endpointUrl: string;
  description?: string | undefined;
  events: readonly string[];
  status: string;
  allowedClientAccountIds: readonly string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}>;

export function toWebhookSubscriptionSummary(subscription: WebhookSubscription): WebhookSubscriptionSummary {
  return {
    id: subscription.id,
    endpointUrl: subscription.endpointUrl,
    description: subscription.description,
    events: subscription.events,
    status: subscription.status,
    allowedClientAccountIds: subscription.allowedClientAccountIds,
    createdBy: subscription.createdBy,
    createdAt: subscription.createdAt.toISOString(),
    updatedAt: subscription.updatedAt.toISOString(),
  };
}

export type WebhookDeliverySummary = Readonly<{
  id: string;
  eventId: string;
  eventType: string;
  status: string;
  attemptCount: number;
  httpStatus?: number | undefined;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  nextAvailableAt: string;
  errorSummary?: string | undefined;
  createdAt: string;
}>;

export function toWebhookDeliverySummary(delivery: WebhookDelivery): WebhookDeliverySummary {
  return {
    id: delivery.id,
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    status: delivery.status,
    attemptCount: delivery.attemptCount,
    httpStatus: delivery.httpStatus,
    startedAt: delivery.startedAt?.toISOString(),
    completedAt: delivery.completedAt?.toISOString(),
    nextAvailableAt: delivery.nextAvailableAt.toISOString(),
    errorSummary: delivery.errorSummary,
    createdAt: delivery.createdAt.toISOString(),
  };
}
