import { Inject, Injectable } from "@nestjs/common";
import { SubscriptionNotFoundError } from "../../domain/errors";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY, type OrganizationSubscriptionRepository } from "../ports/organization-subscription.repository";

export type CancelSubscriptionCommand = Readonly<{ organizationId: string; actorId: string; occurredAt: Date }>;

@Injectable()
export class CancelSubscriptionUseCase {
  constructor(
    @Inject(ORGANIZATION_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: OrganizationSubscriptionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: CancelSubscriptionCommand): Promise<void> {
    const subscription = await this.subscriptionRepository.findByOrganizationId(command.organizationId);
    if (!subscription) {
      throw new SubscriptionNotFoundError(command.organizationId);
    }

    subscription.cancel(command.occurredAt);
    await this.subscriptionRepository.save(subscription);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "SubscriptionCanceled",
      resourceType: "OrganizationSubscription",
      resourceId: subscription.id,
      metadata: { planTier: subscription.planTier },
    });
  }
}
