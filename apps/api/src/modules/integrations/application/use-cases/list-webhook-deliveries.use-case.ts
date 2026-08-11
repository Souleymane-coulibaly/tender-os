import { Inject, Injectable } from "@nestjs/common";
import { WebhookSubscriptionNotFoundError } from "../../domain/errors";
import { assertHasIntegrationPermission, IntegrationPermission } from "../../domain/integration-permission";
import { WEBHOOK_DELIVERY_REPOSITORY, type WebhookDeliveryRepository } from "../ports/webhook-delivery.repository";
import { WEBHOOK_SUBSCRIPTION_REPOSITORY, type WebhookSubscriptionRepository } from "../ports/webhook-subscription.repository";
import { toWebhookDeliverySummary, type WebhookDeliverySummary } from "../dtos";

export type ListWebhookDeliveriesQuery = Readonly<{ organizationId: string; actorRole: string; subscriptionId: string; limit: number; cursor?: string | undefined }>;
export type ListWebhookDeliveriesResult = Readonly<{ items: WebhookDeliverySummary[]; nextCursor: string | null }>;

/** Mission §56 — permet à l'utilisateur de diagnostiquer (200/500/timeout/retry). Le corps de
 *  réponse externe n'est JAMAIS conservé tel quel (mission §56 "limiter/sanitizer") — seule
 *  `errorSummary`, tronquée à 500 caractères, l'est (voir `WebhookDelivery.recordFailure`). */
@Injectable()
export class ListWebhookDeliveriesUseCase {
  constructor(
    @Inject(WEBHOOK_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: WebhookSubscriptionRepository,
    @Inject(WEBHOOK_DELIVERY_REPOSITORY) private readonly deliveryRepository: WebhookDeliveryRepository,
  ) {}

  async execute(query: ListWebhookDeliveriesQuery): Promise<ListWebhookDeliveriesResult> {
    assertHasIntegrationPermission(query.actorRole, IntegrationPermission.Read);

    const subscription = await this.subscriptionRepository.findById({ organizationId: query.organizationId, subscriptionId: query.subscriptionId });
    if (!subscription) {
      throw new WebhookSubscriptionNotFoundError();
    }

    const page = await this.deliveryRepository.listBySubscription({ organizationId: query.organizationId, subscriptionId: query.subscriptionId, limit: query.limit, cursor: query.cursor });
    return { items: page.items.map(toWebhookDeliverySummary), nextCursor: page.nextCursor };
  }
}
