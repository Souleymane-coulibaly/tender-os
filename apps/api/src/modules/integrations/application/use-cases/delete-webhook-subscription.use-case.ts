import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { WebhookSubscriptionNotFoundError } from "../../domain/errors";
import { assertHasIntegrationPermission, IntegrationPermission } from "../../domain/integration-permission";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { WEBHOOK_SUBSCRIPTION_REPOSITORY, type WebhookSubscriptionRepository } from "../ports/webhook-subscription.repository";

export type DeleteWebhookSubscriptionCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; subscriptionId: string; requestId?: string | undefined }>;

/** Mission §58 — soft delete (même convention que ClientAccount/SubcontractorProfile ailleurs
 *  dans ce dépôt) : `deletedAt` posé, jamais une ligne physiquement supprimée, l'historique des
 *  deliveries déjà émises reste consultable pour audit. */
@Injectable()
export class DeleteWebhookSubscriptionUseCase {
  constructor(
    @Inject(WEBHOOK_SUBSCRIPTION_REPOSITORY) private readonly repository: WebhookSubscriptionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: DeleteWebhookSubscriptionCommand): Promise<void> {
    assertHasIntegrationPermission(command.actorRole, IntegrationPermission.WebhooksManage);

    const subscription = await this.repository.findById({ organizationId: command.organizationId, subscriptionId: command.subscriptionId });
    if (!subscription) {
      throw new WebhookSubscriptionNotFoundError();
    }

    subscription.softDelete(this.clock.now());
    await this.repository.save(subscription);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "WebhookDeleted",
      resourceType: "webhook_subscription",
      resourceId: subscription.id,
      requestId: command.requestId,
    });
  }
}
