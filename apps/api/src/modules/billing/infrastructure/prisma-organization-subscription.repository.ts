import { Injectable } from "@nestjs/common";
import type { OrganizationSubscription as PrismaOrganizationSubscription } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { OrganizationSubscription } from "../domain/organization-subscription.aggregate";
import { parseBillingInterval } from "../domain/billing-interval";
import { parsePlanSource } from "../domain/plan-source";
import { parseSubscriptionPlanTier } from "../domain/plan-tier";
import { parseSubscriptionStatus } from "../domain/subscription-status";
import type { OrganizationSubscriptionRepository } from "../application/ports/organization-subscription.repository";

function toDomain(row: PrismaOrganizationSubscription): OrganizationSubscription {
  return OrganizationSubscription.reconstitute({
    id: row.id,
    organizationId: row.organizationId,
    planTier: parseSubscriptionPlanTier(row.planTier),
    billingInterval: parseBillingInterval(row.billingInterval),
    status: parseSubscriptionStatus(row.status),
    source: parsePlanSource(row.source),
    stripeCustomerId: row.stripeCustomerId ?? undefined,
    stripeSubscriptionId: row.stripeSubscriptionId ?? undefined,
    currentPeriodStart: row.currentPeriodStart ?? undefined,
    currentPeriodEnd: row.currentPeriodEnd ?? undefined,
    canceledAt: row.canceledAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

@Injectable()
export class PrismaOrganizationSubscriptionRepository implements OrganizationSubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByOrganizationId(organizationId: string): Promise<OrganizationSubscription | null> {
    const row = await this.prisma.currentClient().organizationSubscription.findUnique({ where: { organizationId } });
    return row ? toDomain(row) : null;
  }

  async save(subscription: OrganizationSubscription): Promise<void> {
    const props = subscription.toProps();
    const data = {
      planTier: props.planTier,
      billingInterval: props.billingInterval,
      status: props.status,
      source: props.source,
      stripeCustomerId: props.stripeCustomerId ?? null,
      stripeSubscriptionId: props.stripeSubscriptionId ?? null,
      currentPeriodStart: props.currentPeriodStart ?? null,
      currentPeriodEnd: props.currentPeriodEnd ?? null,
      canceledAt: props.canceledAt ?? null,
    };

    await this.prisma.currentClient().organizationSubscription.upsert({
      where: { organizationId: props.organizationId },
      create: { id: props.id, organizationId: props.organizationId, ...data },
      update: data,
    });
  }
}
