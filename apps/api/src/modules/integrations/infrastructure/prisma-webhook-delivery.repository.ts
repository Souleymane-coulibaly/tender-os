import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { WebhookDeliveryRepository } from "../application/ports/webhook-delivery.repository";
import { WebhookDeliveryStatus } from "../domain/enums";
import type { WebhookDelivery } from "../domain/webhook-delivery.entity";
import { toDomainWebhookDelivery, toWebhookDeliveryData } from "./webhook-delivery.persistence-mapper";

type ClaimedRow = { id: string };

@Injectable()
export class PrismaWebhookDeliveryRepository implements WebhookDeliveryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Mission §44/§90/§115 — `ON CONFLICT DO NOTHING` sur `UNIQUE(subscriptionId, eventId)` :
   *  idempotent par construction, jamais une exception si l'OutboxEvent est re-traité. */
  async createIfNotExists(delivery: WebhookDelivery): Promise<boolean> {
    const result = await this.prisma.currentClient().webhookDelivery.createMany({
      data: [toWebhookDeliveryData(delivery)],
      skipDuplicates: true,
    });
    return result.count > 0;
  }

  async save(delivery: WebhookDelivery): Promise<void> {
    await this.prisma.currentClient().webhookDelivery.update({
      where: { id_organizationId: { id: delivery.id, organizationId: delivery.organizationId } },
      data: toWebhookDeliveryData(delivery),
    });
  }

  async findById(input: { organizationId: string; deliveryId: string }): Promise<WebhookDelivery | null> {
    const row = await this.prisma.currentClient().webhookDelivery.findFirst({ where: { id: input.deliveryId, organizationId: input.organizationId } });
    return row ? toDomainWebhookDelivery(row) : null;
  }

  async listBySubscription(input: { organizationId: string; subscriptionId: string; limit: number; cursor?: string | undefined }): Promise<{ items: WebhookDelivery[]; nextCursor: string | null }> {
    const rows = await this.prisma.currentClient().webhookDelivery.findMany({
      where: { organizationId: input.organizationId, subscriptionId: input.subscriptionId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = rows.length > input.limit;
    const page = hasNextPage ? rows.slice(0, input.limit) : rows;

    return { items: page.map(toDomainWebhookDelivery), nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null };
  }

  /** Mission §121/§122 — même motif `FOR UPDATE SKIP LOCKED` que `PrismaOutboxEventRepository`
   *  (aucune concurrence non protégée entre deux workers), PLUS reprise des lignes bloquées en
   *  DELIVERING au-delà de `staleDeliveringThresholdMs` (crash worker après claim — amélioration
   *  délibérée, l'Outbox existant n'a pas cette reprise, voir rapport Sprint 16). */
  async claimPendingBatch(input: { limit: number; now: Date; staleDeliveringThresholdMs: number }): Promise<WebhookDelivery[]> {
    const staleBefore = new Date(input.now.getTime() - input.staleDeliveringThresholdMs);

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ClaimedRow[]>`
        SELECT id
        FROM webhook_deliveries
        WHERE (status IN ('PENDING', 'RETRYING') AND next_available_at <= ${input.now})
           OR (status = 'DELIVERING' AND started_at <= ${staleBefore})
        ORDER BY created_at
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      `;

      if (rows.length === 0) {
        return [];
      }

      const ids = rows.map((row) => row.id);
      await tx.webhookDelivery.updateMany({
        where: { id: { in: ids } },
        data: { status: WebhookDeliveryStatus.Delivering, startedAt: input.now },
      });

      const claimed = await tx.webhookDelivery.findMany({ where: { id: { in: ids } } });
      return claimed.map(toDomainWebhookDelivery);
    });
  }
}
