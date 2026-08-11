import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { WebhookSubscriptionRepository } from "../application/ports/webhook-subscription.repository";
import { WebhookSubscriptionStatus } from "../domain/enums";
import type { WebhookSubscription } from "../domain/webhook-subscription.entity";
import { toDomainWebhookSubscription, toWebhookSubscriptionRow } from "./webhook-subscription.persistence-mapper";

@Injectable()
export class PrismaWebhookSubscriptionRepository implements WebhookSubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(subscription: WebhookSubscription): Promise<void> {
    await this.prisma.currentClient().webhookSubscription.create({ data: toWebhookSubscriptionRow(subscription) });
  }

  async save(subscription: WebhookSubscription): Promise<void> {
    await this.prisma.currentClient().webhookSubscription.update({
      where: { id_organizationId: { id: subscription.id, organizationId: subscription.organizationId } },
      data: toWebhookSubscriptionRow(subscription),
    });
  }

  async findById(input: { organizationId: string; subscriptionId: string }): Promise<WebhookSubscription | null> {
    const row = await this.prisma.currentClient().webhookSubscription.findFirst({ where: { id: input.subscriptionId, organizationId: input.organizationId } });
    return row ? toDomainWebhookSubscription(row) : null;
  }

  async listByOrganization(input: { organizationId: string }): Promise<readonly WebhookSubscription[]> {
    const rows = await this.prisma.currentClient().webhookSubscription.findMany({ where: { organizationId: input.organizationId }, orderBy: { createdAt: "desc" } });
    return rows.map(toDomainWebhookSubscription);
  }

  async listActiveByOrganizationAndEventType(input: { organizationId: string; eventType: string }): Promise<readonly WebhookSubscription[]> {
    const rows = await this.prisma.currentClient().webhookSubscription.findMany({
      where: { organizationId: input.organizationId, status: WebhookSubscriptionStatus.Active, deletedAt: null, events: { has: input.eventType } },
    });
    return rows.map(toDomainWebhookSubscription);
  }
}
