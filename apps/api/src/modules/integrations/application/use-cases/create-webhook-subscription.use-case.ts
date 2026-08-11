import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { GetClientAccountUseCase } from "../../../client-portfolio";
import { WebhookSubscription } from "../../domain/webhook-subscription.entity";
import { isGovernedWebhookEventType } from "../../domain/event-catalog";
import { InvalidApiKeyClientScopeError, InvalidWebhookEventTypeError } from "../../domain/errors";
import { assertHasIntegrationPermission, IntegrationPermission } from "../../domain/integration-permission";
import { generateWebhookSecret } from "../../domain/services/webhook-signature";
import { assertSafeWebhookEndpointUrl } from "../../domain/services/webhook-url-safety";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { WEBHOOK_SUBSCRIPTION_REPOSITORY, type WebhookSubscriptionRepository } from "../ports/webhook-subscription.repository";

export type CreateWebhookSubscriptionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  endpointUrl: string;
  description?: string | undefined;
  events: readonly string[];
  allowedClientAccountIds?: readonly string[] | undefined;
  requestId?: string | undefined;
}>;

export type CreateWebhookSubscriptionResult = Readonly<{ subscription: WebhookSubscription; secret: string }>;

/** Mission §20/§21/§27/§30/§31 — URL revérifiée SSRF-safe à la création (mission §31, revérifiée
 *  à nouveau à CHAQUE livraison, voir infrastructure/deliver-webhook.ts), events limités au
 *  catalogue gouverné, secret généré ici et retourné UNE SEULE FOIS (même motif que la clé API). */
@Injectable()
export class CreateWebhookSubscriptionUseCase {
  constructor(
    @Inject(WEBHOOK_SUBSCRIPTION_REPOSITORY) private readonly repository: WebhookSubscriptionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
  ) {}

  async execute(command: CreateWebhookSubscriptionCommand): Promise<CreateWebhookSubscriptionResult> {
    assertHasIntegrationPermission(command.actorRole, IntegrationPermission.WebhooksManage);

    assertSafeWebhookEndpointUrl(command.endpointUrl, { requireHttps: process.env.NODE_ENV === "production", allowPrivateNetworks: process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS === "true" });

    for (const eventType of command.events) {
      if (!isGovernedWebhookEventType(eventType)) {
        throw new InvalidWebhookEventTypeError(eventType);
      }
    }

    const allowedClientAccountIds = command.allowedClientAccountIds ?? [];
    for (const clientAccountId of allowedClientAccountIds) {
      try {
        await this.getClientAccountUseCase.execute({ organizationId: command.organizationId, clientAccountId, actorId: command.actorId, actorRole: command.actorRole });
      } catch {
        throw new InvalidApiKeyClientScopeError();
      }
    }

    const secret = generateWebhookSecret();
    const occurredAt = this.clock.now();
    const subscription = WebhookSubscription.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      endpointUrl: command.endpointUrl,
      description: command.description,
      events: command.events,
      secret,
      allowedClientAccountIds,
      createdBy: command.actorId,
      occurredAt,
    });

    await this.repository.create(subscription);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "WebhookCreated",
      resourceType: "webhook_subscription",
      resourceId: subscription.id,
      requestId: command.requestId,
      metadata: { endpointUrl: subscription.endpointUrl, events: subscription.events },
    });

    return { subscription, secret };
  }
}
