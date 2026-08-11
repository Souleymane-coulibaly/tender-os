import { Inject, Injectable } from "@nestjs/common";
import { WebhookSubscriptionNotFoundError } from "../../domain/errors";
import { assertHasIntegrationPermission, IntegrationPermission } from "../../domain/integration-permission";
import { WEBHOOK_SUBSCRIPTION_REPOSITORY, type WebhookSubscriptionRepository } from "../ports/webhook-subscription.repository";
import { toWebhookSubscriptionSummary, type WebhookSubscriptionSummary } from "../dtos";

export type GetWebhookSubscriptionQuery = Readonly<{ organizationId: string; actorRole: string; subscriptionId: string }>;

@Injectable()
export class GetWebhookSubscriptionUseCase {
  constructor(@Inject(WEBHOOK_SUBSCRIPTION_REPOSITORY) private readonly repository: WebhookSubscriptionRepository) {}

  async execute(query: GetWebhookSubscriptionQuery): Promise<WebhookSubscriptionSummary> {
    assertHasIntegrationPermission(query.actorRole, IntegrationPermission.Read);
    const subscription = await this.repository.findById({ organizationId: query.organizationId, subscriptionId: query.subscriptionId });
    if (!subscription || subscription.deletedAt !== undefined) {
      throw new WebhookSubscriptionNotFoundError();
    }
    return toWebhookSubscriptionSummary(subscription);
  }
}
