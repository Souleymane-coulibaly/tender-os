import { describe, expect, it } from "vitest";
import { BillingInterval } from "./billing-interval";
import { OrganizationSubscription } from "./organization-subscription.aggregate";
import { PlanSource } from "./plan-source";
import { PlanTier } from "./plan-tier";
import { SubscriptionStatus } from "./subscription-status";

const OCCURRED_AT = new Date("2026-08-15T09:00:00Z");
const TRIAL_ENDS_AT = new Date("2026-08-29T09:00:00Z");

function createTrialing(): OrganizationSubscription {
  return OrganizationSubscription.create({
    id: "sub-1",
    organizationId: "org-1",
    planTier: PlanTier.Starter,
    billingInterval: BillingInterval.Monthly,
    source: PlanSource.Stripe,
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    status: SubscriptionStatus.Trialing,
    trialEndsAt: TRIAL_ENDS_AT,
    occurredAt: OCCURRED_AT,
  });
}

describe("OrganizationSubscription.create", () => {
  it("defaults to ACTIVE when no status is provided — historical behavior unchanged for every existing caller", () => {
    const subscription = OrganizationSubscription.create({
      id: "sub-1",
      organizationId: "org-1",
      planTier: PlanTier.Starter,
      billingInterval: BillingInterval.Monthly,
      source: PlanSource.Manual,
      occurredAt: OCCURRED_AT,
    });

    expect(subscription.status).toBe(SubscriptionStatus.Active);
    expect(subscription.isActive).toBe(true);
    expect(subscription.trialEndsAt).toBeUndefined();
  });

  it("V2 Sprint 25 — accepts an explicit TRIALING status and trialEndsAt", () => {
    const subscription = createTrialing();

    expect(subscription.status).toBe(SubscriptionStatus.Trialing);
    expect(subscription.trialEndsAt).toEqual(TRIAL_ENDS_AT);
  });
});

describe("OrganizationSubscription.isEntitled vs isActive", () => {
  it("TRIALING is entitled but NOT strictly active — the two getters diverge on purpose", () => {
    const subscription = createTrialing();

    expect(subscription.isEntitled).toBe(true);
    expect(subscription.isActive).toBe(false);
  });

  it("ACTIVE is both entitled and active", () => {
    const subscription = OrganizationSubscription.create({
      id: "sub-1",
      organizationId: "org-1",
      planTier: PlanTier.Starter,
      billingInterval: BillingInterval.Monthly,
      source: PlanSource.Stripe,
      occurredAt: OCCURRED_AT,
    });

    expect(subscription.isEntitled).toBe(true);
    expect(subscription.isActive).toBe(true);
  });

  it("PAST_DUE/CANCELED are neither entitled nor active", () => {
    const subscription = createTrialing();
    subscription.markPastDue(OCCURRED_AT);
    expect(subscription.isEntitled).toBe(false);

    const canceled = createTrialing();
    canceled.cancel(OCCURRED_AT);
    expect(canceled.isEntitled).toBe(false);
  });
});

describe("OrganizationSubscription.updateFromStripeStatus", () => {
  it("V2 Sprint 25 — transitions TRIALING -> ACTIVE and clears trialEndsAt (mission §21)", () => {
    const subscription = createTrialing();
    const convertedAt = new Date("2026-08-29T10:00:00Z");

    subscription.updateFromStripeStatus({ status: SubscriptionStatus.Active, occurredAt: convertedAt });

    expect(subscription.status).toBe(SubscriptionStatus.Active);
    expect(subscription.trialEndsAt).toBeUndefined();
    expect(subscription.isActive).toBe(true);
  });

  it("never carries a stale trialEndsAt once TRIALING is left, even if the caller passes one by mistake", () => {
    const subscription = createTrialing();
    subscription.updateFromStripeStatus({ status: SubscriptionStatus.PastDue, trialEndsAt: TRIAL_ENDS_AT, occurredAt: OCCURRED_AT });

    expect(subscription.trialEndsAt).toBeUndefined();
  });

  it("does not affect planTier/billingInterval/source — only status/trialEndsAt", () => {
    const subscription = createTrialing();
    subscription.updateFromStripeStatus({ status: SubscriptionStatus.Active, occurredAt: OCCURRED_AT });

    expect(subscription.planTier).toBe(PlanTier.Starter);
    expect(subscription.source).toBe(PlanSource.Stripe);
  });
});

describe("OrganizationSubscription.reassign — invariant preserved (V2 Sprint 25 regression guard)", () => {
  it("NEVER touches status, even when reassigning a TRIALING subscription (Platform Admin MANUAL/GRANTED safety)", () => {
    const subscription = createTrialing();

    subscription.reassign({
      planTier: PlanTier.Business,
      billingInterval: BillingInterval.Yearly,
      source: PlanSource.Granted,
      occurredAt: OCCURRED_AT,
    });

    // Toujours TRIALING — `reassign` seul ne peut jamais démarrer/arrêter un Trial.
    expect(subscription.status).toBe(SubscriptionStatus.Trialing);
    expect(subscription.planTier).toBe(PlanTier.Business);
  });
});
