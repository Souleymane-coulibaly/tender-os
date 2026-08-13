import { PlanSource } from "./plan-source";
import type { SubscriptionPlanTier } from "./plan-tier";
import { BillingInterval } from "./billing-interval";
import { SubscriptionStatus } from "./subscription-status";

export type OrganizationSubscriptionProps = {
  id: string;
  organizationId: string;
  planTier: SubscriptionPlanTier;
  billingInterval: BillingInterval;
  status: SubscriptionStatus;
  source: PlanSource;
  stripeCustomerId?: string | undefined;
  stripeSubscriptionId?: string | undefined;
  currentPeriodStart?: Date | undefined;
  currentPeriodEnd?: Date | undefined;
  canceledAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * V2 Sprint 22 (billing, étape 22A) — état COURANT de l'abonnement récurrent d'une organisation.
 * Jamais PASS (voir `PassPurchase`), jamais CONSEIL (hors catalogue SaaS). Une seule instance par
 * organisation (contrainte `@unique` sur `organizationId`, `prisma-organization-subscription.repository.ts`)
 * — changer de palier MUTE cette même ligne, ne crée jamais une seconde ligne (l'historique vit
 * dans AuditLog : `PlanAssigned`/`PlanChanged`/`SubscriptionChanged`/`SubscriptionCanceled`,
 * mission §68, écrits par les use cases appelants — jamais par cet agrégat lui-même).
 */
export class OrganizationSubscription {
  private constructor(private props: OrganizationSubscriptionProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    planTier: SubscriptionPlanTier;
    billingInterval: BillingInterval;
    source: PlanSource;
    stripeCustomerId?: string | undefined;
    stripeSubscriptionId?: string | undefined;
    currentPeriodStart?: Date | undefined;
    currentPeriodEnd?: Date | undefined;
    occurredAt: Date;
  }): OrganizationSubscription {
    return new OrganizationSubscription({
      id: input.id,
      organizationId: input.organizationId,
      planTier: input.planTier,
      billingInterval: input.billingInterval,
      status: SubscriptionStatus.Active,
      source: input.source,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      canceledAt: undefined,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static reconstitute(props: OrganizationSubscriptionProps): OrganizationSubscription {
    return new OrganizationSubscription(props);
  }

  /** Changement de palier et/ou d'intervalle (mission §32-§34 : Pass→Starter/Business,
   *  Starter↔Business). Ne touche jamais au statut : un abonnement CANCELED ne redevient ACTIVE
   *  qu'explicitement via `reactivate()`. */
  changePlan(input: { planTier: SubscriptionPlanTier; billingInterval: BillingInterval; occurredAt: Date }): void {
    this.props = { ...this.props, planTier: input.planTier, billingInterval: input.billingInterval, updatedAt: input.occurredAt };
  }

  markPastDue(occurredAt: Date): void {
    this.props = { ...this.props, status: SubscriptionStatus.PastDue, updatedAt: occurredAt };
  }

  reactivate(occurredAt: Date): void {
    this.props = { ...this.props, status: SubscriptionStatus.Active, canceledAt: undefined, updatedAt: occurredAt };
  }

  cancel(occurredAt: Date): void {
    this.props = { ...this.props, status: SubscriptionStatus.Canceled, canceledAt: occurredAt, updatedAt: occurredAt };
  }

  get id(): string {
    return this.props.id;
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get planTier(): SubscriptionPlanTier {
    return this.props.planTier;
  }

  get billingInterval(): BillingInterval {
    return this.props.billingInterval;
  }

  get status(): SubscriptionStatus {
    return this.props.status;
  }

  get source(): PlanSource {
    return this.props.source;
  }

  get isActive(): boolean {
    return this.props.status === SubscriptionStatus.Active;
  }

  toProps(): OrganizationSubscriptionProps {
    return { ...this.props };
  }
}
