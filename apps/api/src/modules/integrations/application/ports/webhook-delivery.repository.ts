import type { WebhookDelivery } from "../../domain/webhook-delivery.entity";

export interface WebhookDeliveryRepository {
  /** Insertion idempotente (mission §44/§90/§115) — `true` si une nouvelle ligne a été créée,
   *  `false` si `(subscriptionId, eventId)` existait déjà (conflit ignoré, jamais une erreur). */
  createIfNotExists(delivery: WebhookDelivery): Promise<boolean>;
  save(delivery: WebhookDelivery): Promise<void>;
  findById(input: { organizationId: string; deliveryId: string }): Promise<WebhookDelivery | null>;
  listBySubscription(input: { organizationId: string; subscriptionId: string; limit: number; cursor?: string | undefined }): Promise<{ items: WebhookDelivery[]; nextCursor: string | null }>;
  /** Mission §121/§122 — `FOR UPDATE SKIP LOCKED` (même motif que `PrismaOutboxEventRepository`)
   *  PLUS reprise des lignes bloquées en DELIVERING au-delà d'un délai raisonnable (crash worker
   *  après claim, jamais repris par l'Outbox existant — amélioration délibérée ici). */
  claimPendingBatch(input: { limit: number; now: Date; staleDeliveringThresholdMs: number }): Promise<WebhookDelivery[]>;
}

export const WEBHOOK_DELIVERY_REPOSITORY = Symbol("WEBHOOK_DELIVERY_REPOSITORY");
