import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { WebhookDelivery } from "../../domain/webhook-delivery.entity";
import { WebhookSubscriptionNotFoundError } from "../../domain/errors";
import { assertHasIntegrationPermission, IntegrationPermission } from "../../domain/integration-permission";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { WEBHOOK_DELIVERY_REPOSITORY, type WebhookDeliveryRepository } from "../ports/webhook-delivery.repository";
import { WEBHOOK_SUBSCRIPTION_REPOSITORY, type WebhookSubscriptionRepository } from "../ports/webhook-subscription.repository";
import { toWebhookDeliverySummary, type WebhookDeliverySummary } from "../dtos";

export type SendTestWebhookEventCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; subscriptionId: string; requestId?: string | undefined }>;

/** Mission §47/§48 — un VRAI événement `webhook.test` signé, livré par le même worker que les
 *  événements métier (jamais une simulation en mémoire qui n'atteint jamais le worker de
 *  livraison réel) : crée une `WebhookDelivery` PENDING, le worker la traite au prochain tick
 *  exactement comme n'importe quelle autre delivery. */
@Injectable()
export class SendTestWebhookEventUseCase {
  constructor(
    @Inject(WEBHOOK_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: WebhookSubscriptionRepository,
    @Inject(WEBHOOK_DELIVERY_REPOSITORY) private readonly deliveryRepository: WebhookDeliveryRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SendTestWebhookEventCommand): Promise<WebhookDeliverySummary> {
    assertHasIntegrationPermission(command.actorRole, IntegrationPermission.WebhooksManage);

    const subscription = await this.subscriptionRepository.findById({ organizationId: command.organizationId, subscriptionId: command.subscriptionId });
    if (!subscription) {
      throw new WebhookSubscriptionNotFoundError();
    }

    const occurredAt = this.clock.now();
    const eventId = this.idGenerator.generate();
    const deliveryId = this.idGenerator.generate();

    const delivery = WebhookDelivery.create({
      id: deliveryId,
      organizationId: command.organizationId,
      subscriptionId: subscription.id,
      eventId,
      eventType: "webhook.test",
      payload: { id: eventId, type: "webhook.test", version: 1, occurredAt: occurredAt.toISOString(), organizationId: command.organizationId, data: { message: "This is a test event sent from TenderOS." } },
      occurredAt,
    });

    await this.deliveryRepository.createIfNotExists(delivery);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "WebhookTestSent",
      resourceType: "webhook_subscription",
      resourceId: subscription.id,
      requestId: command.requestId,
      metadata: { deliveryId },
    });

    return toWebhookDeliverySummary(delivery);
  }
}
