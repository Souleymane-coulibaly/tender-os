import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { GetClientAccountUseCase } from "../../../client-portfolio";
import { isGovernedWebhookEventType } from "../../domain/event-catalog";
import { InvalidApiKeyClientScopeError, InvalidWebhookEventTypeError, WebhookSubscriptionNotFoundError } from "../../domain/errors";
import { assertHasIntegrationPermission, IntegrationPermission } from "../../domain/integration-permission";
import { assertSafeWebhookEndpointUrl } from "../../domain/services/webhook-url-safety";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { WEBHOOK_SUBSCRIPTION_REPOSITORY, type WebhookSubscriptionRepository } from "../ports/webhook-subscription.repository";
import { toWebhookSubscriptionSummary, type WebhookSubscriptionSummary } from "../dtos";

export type UpdateWebhookSubscriptionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  subscriptionId: string;
  endpointUrl?: string | undefined;
  description?: string | undefined;
  events?: readonly string[] | undefined;
  allowedClientAccountIds?: readonly string[] | undefined;
  requestId?: string | undefined;
}>;

@Injectable()
export class UpdateWebhookSubscriptionUseCase {
  constructor(
    @Inject(WEBHOOK_SUBSCRIPTION_REPOSITORY) private readonly repository: WebhookSubscriptionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
  ) {}

  async execute(command: UpdateWebhookSubscriptionCommand): Promise<WebhookSubscriptionSummary> {
    assertHasIntegrationPermission(command.actorRole, IntegrationPermission.WebhooksManage);

    const subscription = await this.repository.findById({ organizationId: command.organizationId, subscriptionId: command.subscriptionId });
    if (!subscription) {
      throw new WebhookSubscriptionNotFoundError();
    }

    if (command.endpointUrl !== undefined) {
      assertSafeWebhookEndpointUrl(command.endpointUrl, { requireHttps: process.env.NODE_ENV === "production", allowPrivateNetworks: process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS === "true" });
    }
    if (command.events !== undefined) {
      for (const eventType of command.events) {
        if (!isGovernedWebhookEventType(eventType)) {
          throw new InvalidWebhookEventTypeError(eventType);
        }
      }
    }
    if (command.allowedClientAccountIds !== undefined) {
      for (const clientAccountId of command.allowedClientAccountIds) {
        try {
          await this.getClientAccountUseCase.execute({ organizationId: command.organizationId, clientAccountId, actorId: command.actorId, actorRole: command.actorRole });
        } catch {
          throw new InvalidApiKeyClientScopeError();
        }
      }
    }

    subscription.update({
      endpointUrl: command.endpointUrl,
      description: command.description,
      events: command.events,
      allowedClientAccountIds: command.allowedClientAccountIds,
      occurredAt: this.clock.now(),
    });
    await this.repository.save(subscription);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "WebhookUpdated",
      resourceType: "webhook_subscription",
      resourceId: subscription.id,
      requestId: command.requestId,
      metadata: { endpointUrl: subscription.endpointUrl, events: subscription.events },
    });

    return toWebhookSubscriptionSummary(subscription);
  }
}
