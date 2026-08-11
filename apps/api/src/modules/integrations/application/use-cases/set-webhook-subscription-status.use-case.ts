import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { WebhookSubscriptionNotFoundError } from "../../domain/errors";
import { assertHasIntegrationPermission, IntegrationPermission } from "../../domain/integration-permission";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { WEBHOOK_SUBSCRIPTION_REPOSITORY, type WebhookSubscriptionRepository } from "../ports/webhook-subscription.repository";

export type SetWebhookSubscriptionStatusCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  subscriptionId: string;
  enabled: boolean;
  requestId?: string | undefined;
}>;

/** Mission §57 — DISABLED : plus aucune nouvelle delivery (le handler Outbox filtre sur
 *  `listActiveByOrganizationAndEventType`, jamais une subscription DISABLED). */
@Injectable()
export class SetWebhookSubscriptionStatusUseCase {
  constructor(
    @Inject(WEBHOOK_SUBSCRIPTION_REPOSITORY) private readonly repository: WebhookSubscriptionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SetWebhookSubscriptionStatusCommand): Promise<void> {
    assertHasIntegrationPermission(command.actorRole, IntegrationPermission.WebhooksManage);

    const subscription = await this.repository.findById({ organizationId: command.organizationId, subscriptionId: command.subscriptionId });
    if (!subscription) {
      throw new WebhookSubscriptionNotFoundError();
    }

    const occurredAt = this.clock.now();
    if (command.enabled) subscription.enable(occurredAt);
    else subscription.disable(occurredAt);
    await this.repository.save(subscription);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: command.enabled ? "WebhookEnabled" : "WebhookDisabled",
      resourceType: "webhook_subscription",
      resourceId: subscription.id,
      requestId: command.requestId,
      metadata: { enabled: command.enabled },
    });
  }
}
