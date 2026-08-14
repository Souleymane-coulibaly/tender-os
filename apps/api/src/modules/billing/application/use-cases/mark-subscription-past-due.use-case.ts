import { Inject, Injectable } from "@nestjs/common";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { SubscriptionNotFoundError } from "../../domain/errors";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY, type OrganizationSubscriptionRepository } from "../ports/organization-subscription.repository";

export type MarkSubscriptionPastDueCommand = Readonly<{ organizationId: string; occurredAt: Date }>;

/**
 * V2 Sprint 22 (billing, étape 22E) — mission §54 "paiement échoué". Correctif d'un écart réel
 * trouvé en préparant 22E : le commentaire de `subscription-status.ts` affirmait la bascule
 * PAST_DUE "livrée en 22C", mais `HandleStripeWebhookUseCase` ne traitait jamais
 * `invoice.payment_failed` — la méthode `markPastDue()` de l'agrégat n'était appelée NULLE PART.
 * Jamais déclenché par un acteur applicatif (webhook Stripe uniquement) : notifie les OWNER/
 * ORGANIZATION_ADMIN de l'organisation (aucun utilisateur "acteur" évident), jamais un utilisateur
 * arbitraire.
 */
@Injectable()
export class MarkSubscriptionPastDueUseCase {
  constructor(
    @Inject(ORGANIZATION_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: OrganizationSubscriptionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
  ) {}

  async execute(command: MarkSubscriptionPastDueCommand): Promise<void> {
    const subscription = await this.subscriptionRepository.findByOrganizationId(command.organizationId);
    if (!subscription) {
      throw new SubscriptionNotFoundError(command.organizationId);
    }

    subscription.markPastDue(command.occurredAt);
    await this.subscriptionRepository.save(subscription);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: "stripe-webhook",
      action: "SubscriptionChanged",
      resourceType: "OrganizationSubscription",
      resourceId: subscription.id,
      metadata: { toStatus: "PAST_DUE" },
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "SubscriptionPaymentFailed",
          aggregateType: "OrganizationSubscription",
          aggregateId: subscription.id,
          payload: { planTier: subscription.planTier },
          occurredAt: command.occurredAt,
        },
      ],
    });
  }
}
