import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { BillingInterval } from "../../domain/billing-interval";
import { OrganizationSubscription } from "../../domain/organization-subscription.aggregate";
import { PlanSource } from "../../domain/plan-source";
import type { SubscriptionPlanTier } from "../../domain/plan-tier";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY, type OrganizationSubscriptionRepository } from "../ports/organization-subscription.repository";

export type AssignSubscriptionCommand = Readonly<{
  organizationId: string;
  planTier: SubscriptionPlanTier;
  billingInterval: BillingInterval;
  source: PlanSource;
  stripeCustomerId?: string | undefined;
  stripeSubscriptionId?: string | undefined;
  currentPeriodStart?: Date | undefined;
  currentPeriodEnd?: Date | undefined;
  actorId: string;
  occurredAt: Date;
}>;

/**
 * V2 Sprint 22 (billing, étape 22A) — création OU changement de palier/intervalle sur la ligne
 * unique de l'organisation (jamais deux abonnements). Réutilisable par STRIPE (22C, checkout
 * complété) et MANUAL/GRANTED (22D, assignation Platform Admin) — la seule différence entre les
 * deux est `source`, jamais une logique dupliquée.
 */
@Injectable()
export class AssignSubscriptionUseCase {
  constructor(
    @Inject(ORGANIZATION_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: OrganizationSubscriptionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: AssignSubscriptionCommand): Promise<OrganizationSubscription> {
    const existing = await this.subscriptionRepository.findByOrganizationId(command.organizationId);

    if (!existing) {
      const subscription = OrganizationSubscription.create({
        id: randomUUID(),
        organizationId: command.organizationId,
        planTier: command.planTier,
        billingInterval: command.billingInterval,
        source: command.source,
        stripeCustomerId: command.stripeCustomerId,
        stripeSubscriptionId: command.stripeSubscriptionId,
        currentPeriodStart: command.currentPeriodStart,
        currentPeriodEnd: command.currentPeriodEnd,
        occurredAt: command.occurredAt,
      });
      await this.subscriptionRepository.save(subscription);
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "PlanAssigned",
        resourceType: "OrganizationSubscription",
        resourceId: subscription.id,
        metadata: { planTier: command.planTier, billingInterval: command.billingInterval, source: command.source },
      });
      return subscription;
    }

    const previousPlanTier = existing.planTier;
    const planChanged = previousPlanTier !== command.planTier;
    const intervalChanged = existing.billingInterval !== command.billingInterval;

    existing.changePlan({ planTier: command.planTier, billingInterval: command.billingInterval, occurredAt: command.occurredAt });
    await this.subscriptionRepository.save(existing);

    if (planChanged) {
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "PlanChanged",
        resourceType: "OrganizationSubscription",
        resourceId: existing.id,
        metadata: { fromPlanTier: previousPlanTier, toPlanTier: command.planTier },
      });
    }
    if (intervalChanged) {
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "BillingIntervalChanged",
        resourceType: "OrganizationSubscription",
        resourceId: existing.id,
        metadata: { toBillingInterval: command.billingInterval },
      });
    }

    return existing;
  }
}
