import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { WebhookDeliveryNotFoundError, WebhookDeliveryNotRetryableError } from "../../domain/errors";
import { assertHasIntegrationPermission, IntegrationPermission } from "../../domain/integration-permission";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { WEBHOOK_DELIVERY_REPOSITORY, type WebhookDeliveryRepository } from "../ports/webhook-delivery.repository";
import { toWebhookDeliverySummary, type WebhookDeliverySummary } from "../dtos";

export type RetryWebhookDeliveryCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; deliveryId: string; requestId?: string | undefined }>;

/** Mission §43/§111 — réservé à un acteur autorisé (`WebhooksManage`, jamais un CONTRIBUTOR). */
@Injectable()
export class RetryWebhookDeliveryUseCase {
  constructor(
    @Inject(WEBHOOK_DELIVERY_REPOSITORY) private readonly repository: WebhookDeliveryRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RetryWebhookDeliveryCommand): Promise<WebhookDeliverySummary> {
    assertHasIntegrationPermission(command.actorRole, IntegrationPermission.WebhooksManage);

    const delivery = await this.repository.findById({ organizationId: command.organizationId, deliveryId: command.deliveryId });
    if (!delivery) {
      throw new WebhookDeliveryNotFoundError();
    }
    if (!delivery.isRetryableNow) {
      throw new WebhookDeliveryNotRetryableError();
    }

    delivery.scheduleManualRetry(this.clock.now());
    await this.repository.save(delivery);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "WebhookDeliveryRetried",
      resourceType: "webhook_delivery",
      resourceId: delivery.id,
      requestId: command.requestId,
    });

    return toWebhookDeliverySummary(delivery);
  }
}
