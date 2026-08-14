import { beforeEach, describe, expect, it } from "vitest";
import { BillingInterval } from "../../domain/billing-interval";
import { SubscriptionNotFoundError } from "../../domain/errors";
import { OrganizationSubscription } from "../../domain/organization-subscription.aggregate";
import { PlanSource } from "../../domain/plan-source";
import { PlanTier } from "../../domain/plan-tier";
import { SubscriptionStatus } from "../../domain/subscription-status";
import { FIXED_NOW, FakeOutboxWriter, InMemoryAuditLogWriter, InMemoryOrganizationSubscriptionRepository } from "../../test-support/fakes";
import { CancelSubscriptionUseCase } from "./cancel-subscription.use-case";

const ORG_A = "org-a";

describe("CancelSubscriptionUseCase", () => {
  let subscriptions: InMemoryOrganizationSubscriptionRepository;
  let auditLog: InMemoryAuditLogWriter;
  let outbox: FakeOutboxWriter;
  let useCase: CancelSubscriptionUseCase;

  beforeEach(() => {
    subscriptions = new InMemoryOrganizationSubscriptionRepository();
    auditLog = new InMemoryAuditLogWriter();
    outbox = new FakeOutboxWriter();
    useCase = new CancelSubscriptionUseCase(subscriptions, auditLog, outbox);
  });

  it("mission §54 'annulation programmée' — correctif audit Codex 22E (P1-03) — cancels, audits, and emits SubscriptionCanceled", async () => {
    await subscriptions.save(
      OrganizationSubscription.create({ id: "sub-1", organizationId: ORG_A, planTier: PlanTier.Starter, billingInterval: BillingInterval.Monthly, source: PlanSource.Stripe, occurredAt: FIXED_NOW }),
    );

    await useCase.execute({ organizationId: ORG_A, actorId: "stripe-webhook", occurredAt: FIXED_NOW });

    const subscription = await subscriptions.findByOrganizationId(ORG_A);
    expect(subscription?.status).toBe(SubscriptionStatus.Canceled);
    expect(auditLog.entries.some((e) => e.action === "SubscriptionCanceled")).toBe(true);
    expect(outbox.events.map((e) => e.eventType)).toEqual(["SubscriptionCanceled"]);
  });

  it("refuses for an organization with no subscription", async () => {
    await expect(useCase.execute({ organizationId: ORG_A, actorId: "stripe-webhook", occurredAt: FIXED_NOW })).rejects.toBeInstanceOf(SubscriptionNotFoundError);
  });
});
