import { beforeEach, describe, expect, it } from "vitest";
import { BillingInterval } from "../../domain/billing-interval";
import { SubscriptionNotFoundError } from "../../domain/errors";
import { OrganizationSubscription } from "../../domain/organization-subscription.aggregate";
import { PlanSource } from "../../domain/plan-source";
import { PlanTier } from "../../domain/plan-tier";
import { SubscriptionStatus } from "../../domain/subscription-status";
import { FIXED_NOW, FakeOutboxWriter, InMemoryAuditLogWriter, InMemoryOrganizationSubscriptionRepository } from "../../test-support/fakes";
import { MarkSubscriptionPastDueUseCase } from "./mark-subscription-past-due.use-case";

const ORG_A = "org-a";

describe("MarkSubscriptionPastDueUseCase", () => {
  let subscriptions: InMemoryOrganizationSubscriptionRepository;
  let auditLog: InMemoryAuditLogWriter;
  let outbox: FakeOutboxWriter;
  let useCase: MarkSubscriptionPastDueUseCase;

  beforeEach(() => {
    subscriptions = new InMemoryOrganizationSubscriptionRepository();
    auditLog = new InMemoryAuditLogWriter();
    outbox = new FakeOutboxWriter();
    useCase = new MarkSubscriptionPastDueUseCase(subscriptions, auditLog, outbox);
  });

  it("mission §54 'paiement échoué' — marks the subscription PAST_DUE, audits, and emits SubscriptionPaymentFailed", async () => {
    await subscriptions.save(
      OrganizationSubscription.create({ id: "sub-1", organizationId: ORG_A, planTier: PlanTier.Starter, billingInterval: BillingInterval.Monthly, source: PlanSource.Stripe, occurredAt: FIXED_NOW }),
    );

    await useCase.execute({ organizationId: ORG_A, occurredAt: FIXED_NOW });

    const subscription = await subscriptions.findByOrganizationId(ORG_A);
    expect(subscription?.status).toBe(SubscriptionStatus.PastDue);
    expect(auditLog.entries.some((e) => e.action === "SubscriptionChanged")).toBe(true);
    expect(outbox.events.map((e) => e.eventType)).toEqual(["SubscriptionPaymentFailed"]);
  });

  it("refuses for an organization with no subscription", async () => {
    await expect(useCase.execute({ organizationId: ORG_A, occurredAt: FIXED_NOW })).rejects.toBeInstanceOf(SubscriptionNotFoundError);
  });
});
