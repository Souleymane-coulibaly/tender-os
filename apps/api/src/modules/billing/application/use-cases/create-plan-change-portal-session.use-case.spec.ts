import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BillingInterval } from "../../domain/billing-interval";
import {
  BillingManagementPermissionMissingError,
  NoStripeCustomerForOrganizationError,
  PlanChangeTargetIsCurrentPlanError,
  StripePriceNotConfiguredError,
  StripeSubscriptionNotUpdatableError,
} from "../../domain/errors";
import { OrganizationSubscription } from "../../domain/organization-subscription.aggregate";
import { PlanSource } from "../../domain/plan-source";
import { PlanTier } from "../../domain/plan-tier";
import { SubscriptionStatus } from "../../domain/subscription-status";
import { FIXED_NOW, FakeStripeClient, InMemoryOrganizationSubscriptionRepository } from "../../test-support/fakes";
import { CreatePlanChangePortalSessionUseCase } from "./create-plan-change-portal-session.use-case";

const ORG_A = "org-a";

describe("CreatePlanChangePortalSessionUseCase", () => {
  let stripeClient: FakeStripeClient;
  let subscriptions: InMemoryOrganizationSubscriptionRepository;
  let useCase: CreatePlanChangePortalSessionUseCase;
  const originalEnv = { ...process.env };

  async function givenStarterSubscription(overrides: { stripeSubscriptionId?: string | undefined; status?: SubscriptionStatus } = {}) {
    await subscriptions.save(
      OrganizationSubscription.create({
        id: "sub-1",
        organizationId: ORG_A,
        planTier: PlanTier.Starter,
        billingInterval: BillingInterval.Monthly,
        source: PlanSource.Stripe,
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "stripeSubscriptionId" in overrides ? overrides.stripeSubscriptionId : "sub_stripe_1",
        status: overrides.status ?? SubscriptionStatus.Trialing,
        occurredAt: FIXED_NOW,
      }),
    );
  }

  beforeEach(() => {
    process.env.APP_BASE_URL = "https://app.test";
    process.env.STRIPE_PRICE_BUSINESS_MONTHLY = "price_business_monthly";
    process.env.STRIPE_PRICE_ENTERPRISE_YEARLY = "price_enterprise_yearly";
    stripeClient = new FakeStripeClient();
    stripeClient.stripeSubscriptions.set("sub_stripe_1", { status: "trialing", items: [{ id: "si_1", priceId: "price_starter_monthly" }] });
    subscriptions = new InMemoryOrganizationSubscriptionRepository();
    useCase = new CreatePlanChangePortalSessionUseCase(stripeClient, subscriptions);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("opens Stripe directly on the confirmation of the chosen plan: backend-resolved price, the single subscription item, server-side return URL", async () => {
    await givenStarterSubscription();

    const result = await useCase.execute({ organizationId: ORG_A, actorRole: "OWNER", planTier: PlanTier.Business, billingInterval: BillingInterval.Monthly });

    expect(result.url).toContain("sub_stripe_1");
    expect(stripeClient.planChangePortalSessionCalls).toEqual([
      {
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_stripe_1",
        subscriptionItemId: "si_1",
        priceId: "price_business_monthly",
        returnUrl: "https://app.test/app/subscription",
      },
    ]);
    // Jamais le portail générique, jamais une seconde Checkout Session (second abonnement Stripe).
    expect(stripeClient.portalSessionCalls).toEqual([]);
    expect(stripeClient.checkoutSessionCalls).toEqual([]);
  });

  it("resolves the price for the requested interval too (Enterprise yearly)", async () => {
    await givenStarterSubscription();

    await useCase.execute({ organizationId: ORG_A, actorRole: "ORGANIZATION_ADMIN", planTier: PlanTier.Enterprise, billingInterval: BillingInterval.Yearly });

    expect(stripeClient.planChangePortalSessionCalls[0]?.priceId).toBe("price_enterprise_yearly");
  });

  it("refuses the plan the organization is already on, without calling Stripe", async () => {
    await givenStarterSubscription();

    await expect(
      useCase.execute({ organizationId: ORG_A, actorRole: "OWNER", planTier: PlanTier.Starter, billingInterval: BillingInterval.Monthly }),
    ).rejects.toBeInstanceOf(PlanChangeTargetIsCurrentPlanError);
    expect(stripeClient.retrieveSubscriptionCalls).toEqual([]);
  });

  it("fails explicitly, before any Stripe call, when the target price is not configured", async () => {
    await givenStarterSubscription();
    delete process.env.STRIPE_PRICE_BUSINESS_MONTHLY;

    await expect(
      useCase.execute({ organizationId: ORG_A, actorRole: "OWNER", planTier: PlanTier.Business, billingInterval: BillingInterval.Monthly }),
    ).rejects.toBeInstanceOf(StripePriceNotConfiguredError);
    expect(stripeClient.retrieveSubscriptionCalls).toEqual([]);
  });

  it("refuses when the organization has no Stripe customer at all", async () => {
    await expect(
      useCase.execute({ organizationId: ORG_A, actorRole: "OWNER", planTier: PlanTier.Business, billingInterval: BillingInterval.Monthly }),
    ).rejects.toBeInstanceOf(NoStripeCustomerForOrganizationError);
  });

  it("refuses when no Stripe subscription is linked locally", async () => {
    await givenStarterSubscription({ stripeSubscriptionId: undefined });

    await expect(
      useCase.execute({ organizationId: ORG_A, actorRole: "OWNER", planTier: PlanTier.Business, billingInterval: BillingInterval.Monthly }),
    ).rejects.toBeInstanceOf(StripeSubscriptionNotUpdatableError);
  });

  it("refuses when Stripe does not know the linked subscription (local and Stripe out of sync)", async () => {
    await givenStarterSubscription({ stripeSubscriptionId: "sub_unknown" });

    await expect(
      useCase.execute({ organizationId: ORG_A, actorRole: "OWNER", planTier: PlanTier.Business, billingInterval: BillingInterval.Monthly }),
    ).rejects.toBeInstanceOf(StripeSubscriptionNotUpdatableError);
    expect(stripeClient.planChangePortalSessionCalls).toEqual([]);
  });

  it("refuses a subscription canceled on Stripe's side", async () => {
    await givenStarterSubscription();
    stripeClient.stripeSubscriptions.set("sub_stripe_1", { status: "canceled", items: [{ id: "si_1", priceId: "price_starter_monthly" }] });

    await expect(
      useCase.execute({ organizationId: ORG_A, actorRole: "OWNER", planTier: PlanTier.Business, billingInterval: BillingInterval.Monthly }),
    ).rejects.toBeInstanceOf(StripeSubscriptionNotUpdatableError);
  });

  it("refuses a subscription with several items (Stripe's confirmation flow accepts only one)", async () => {
    await givenStarterSubscription();
    stripeClient.stripeSubscriptions.set("sub_stripe_1", {
      status: "active",
      items: [
        { id: "si_1", priceId: "price_starter_monthly" },
        { id: "si_2", priceId: "price_addon" },
      ],
    });

    await expect(
      useCase.execute({ organizationId: ORG_A, actorRole: "OWNER", planTier: PlanTier.Business, billingInterval: BillingInterval.Monthly }),
    ).rejects.toBeInstanceOf(StripeSubscriptionNotUpdatableError);
  });

  it("refuses for a role below OWNER/ORGANIZATION_ADMIN", async () => {
    await givenStarterSubscription();

    await expect(
      useCase.execute({ organizationId: ORG_A, actorRole: "BID_MANAGER", planTier: PlanTier.Business, billingInterval: BillingInterval.Monthly }),
    ).rejects.toBeInstanceOf(BillingManagementPermissionMissingError);
  });
});
