import { beforeEach, describe, expect, it } from "vitest";
import { BillingInterval } from "../../domain/billing-interval";
import { PlanSource } from "../../domain/plan-source";
import { PlanTier } from "../../domain/plan-tier";
import { SubscriptionStatus } from "../../domain/subscription-status";
import { FIXED_NOW, InMemoryAuditLogWriter, InMemoryOrganizationSubscriptionRepository } from "../../test-support/fakes";
import { AssignSubscriptionUseCase } from "./assign-subscription.use-case";

const ORG_A = "org-a";

describe("AssignSubscriptionUseCase", () => {
  let subscriptions: InMemoryOrganizationSubscriptionRepository;
  let auditLog: InMemoryAuditLogWriter;
  let useCase: AssignSubscriptionUseCase;

  beforeEach(() => {
    subscriptions = new InMemoryOrganizationSubscriptionRepository();
    auditLog = new InMemoryAuditLogWriter();
    useCase = new AssignSubscriptionUseCase(subscriptions, auditLog);
  });

  it("creates the organization's first subscription as ACTIVE and audits PlanAssigned", async () => {
    const subscription = await useCase.execute({
      organizationId: ORG_A,
      planTier: PlanTier.Starter,
      billingInterval: BillingInterval.Monthly,
      source: PlanSource.Stripe,
      actorId: "user-1",
      occurredAt: FIXED_NOW,
    });

    expect(subscription.status).toBe(SubscriptionStatus.Active);
    expect(await subscriptions.findByOrganizationId(ORG_A)).not.toBeNull();
    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]?.action).toBe("PlanAssigned");
  });

  it("mutates the SAME row on a plan change, never creates a second subscription, and audits PlanChanged", async () => {
    await useCase.execute({
      organizationId: ORG_A,
      planTier: PlanTier.Starter,
      billingInterval: BillingInterval.Monthly,
      source: PlanSource.Stripe,
      actorId: "user-1",
      occurredAt: FIXED_NOW,
    });

    const upgraded = await useCase.execute({
      organizationId: ORG_A,
      planTier: PlanTier.Business,
      billingInterval: BillingInterval.Monthly,
      source: PlanSource.Stripe,
      actorId: "user-1",
      occurredAt: new Date(FIXED_NOW.getTime() + 1000),
    });

    expect(upgraded.planTier).toBe(PlanTier.Business);
    const planChangedEntry = auditLog.entries.find((e) => e.action === "PlanChanged");
    expect(planChangedEntry?.metadata).toMatchObject({ fromPlanTier: PlanTier.Starter, toPlanTier: PlanTier.Business });
  });

  it("audits BillingIntervalChanged separately from PlanChanged when only the interval changes", async () => {
    await useCase.execute({
      organizationId: ORG_A,
      planTier: PlanTier.Starter,
      billingInterval: BillingInterval.Monthly,
      source: PlanSource.Stripe,
      actorId: "user-1",
      occurredAt: FIXED_NOW,
    });

    await useCase.execute({
      organizationId: ORG_A,
      planTier: PlanTier.Starter,
      billingInterval: BillingInterval.Yearly,
      source: PlanSource.Stripe,
      actorId: "user-1",
      occurredAt: new Date(FIXED_NOW.getTime() + 1000),
    });

    expect(auditLog.entries.some((e) => e.action === "PlanChanged")).toBe(false);
    expect(auditLog.entries.some((e) => e.action === "BillingIntervalChanged")).toBe(true);
  });

  it("supports MANUAL/GRANTED sources for Platform Admin pilots without Stripe", async () => {
    const subscription = await useCase.execute({
      organizationId: ORG_A,
      planTier: PlanTier.Enterprise,
      billingInterval: BillingInterval.Yearly,
      source: PlanSource.Granted,
      actorId: "platform-admin-1",
      occurredAt: FIXED_NOW,
    });

    expect(subscription.source).toBe(PlanSource.Granted);
  });
});
