import type { WebhookDelivery as WebhookDeliveryRow, Prisma } from "@prisma/client";
import { WebhookDelivery } from "../domain/webhook-delivery.entity";
import type { WebhookDeliveryStatus } from "../domain/enums";

export function toDomainWebhookDelivery(row: WebhookDeliveryRow): WebhookDelivery {
  return WebhookDelivery.rehydrate({
    id: row.id,
    organizationId: row.organizationId,
    subscriptionId: row.subscriptionId,
    eventId: row.eventId,
    eventType: row.eventType,
    payload: row.payload as Record<string, unknown>,
    status: row.status as WebhookDeliveryStatus,
    attemptCount: row.attemptCount,
    httpStatus: row.httpStatus ?? undefined,
    startedAt: row.startedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
    nextAvailableAt: row.nextAvailableAt,
    errorSummary: row.errorSummary ?? undefined,
    createdAt: row.createdAt,
  });
}

export function toWebhookDeliveryData(delivery: WebhookDelivery): Prisma.WebhookDeliveryUncheckedCreateInput {
  return {
    id: delivery.id,
    organizationId: delivery.organizationId,
    subscriptionId: delivery.subscriptionId,
    eventId: delivery.eventId,
    eventType: delivery.eventType,
    payload: delivery.payload as Prisma.InputJsonValue,
    status: delivery.status,
    attemptCount: delivery.attemptCount,
    httpStatus: delivery.httpStatus ?? null,
    startedAt: delivery.startedAt ?? null,
    completedAt: delivery.completedAt ?? null,
    nextAvailableAt: delivery.nextAvailableAt,
    errorSummary: delivery.errorSummary ?? null,
    createdAt: delivery.createdAt,
  };
}
