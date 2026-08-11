import { Inject, Injectable } from "@nestjs/common";
import { assertHasIntegrationPermission, IntegrationPermission } from "../../domain/integration-permission";
import { WEBHOOK_SUBSCRIPTION_REPOSITORY, type WebhookSubscriptionRepository } from "../ports/webhook-subscription.repository";
import { toWebhookSubscriptionSummary, type WebhookSubscriptionSummary } from "../dtos";

export type ListWebhookSubscriptionsQuery = Readonly<{ organizationId: string; actorRole: string }>;

@Injectable()
export class ListWebhookSubscriptionsUseCase {
  constructor(@Inject(WEBHOOK_SUBSCRIPTION_REPOSITORY) private readonly repository: WebhookSubscriptionRepository) {}

  async execute(query: ListWebhookSubscriptionsQuery): Promise<WebhookSubscriptionSummary[]> {
    assertHasIntegrationPermission(query.actorRole, IntegrationPermission.Read);
    const subscriptions = await this.repository.listByOrganization({ organizationId: query.organizationId });
    return subscriptions.filter((subscription) => subscription.deletedAt === undefined).map(toWebhookSubscriptionSummary);
  }
}
