import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BillingInterval } from "../../domain/billing-interval";
import { BillingManagementPermissionMissingError } from "../../domain/errors";
import { OrganizationSubscription } from "../../domain/organization-subscription.aggregate";
import { PlanSource } from "../../domain/plan-source";
import { PlanTier } from "../../domain/plan-tier";
import { FIXED_NOW, FakeStripeClient, InMemoryOrganizationSubscriptionRepository } from "../../test-support/fakes";
import { CreateCheckoutSessionUseCase } from "./create-checkout-session.use-case";

const ORG_A = "org-a";

describe("CreateCheckoutSessionUseCase", () => {
  let stripeClient: FakeStripeClient;
  let subscriptions: InMemoryOrganizationSubscriptionRepository;
  let useCase: CreateCheckoutSessionUseCase;
  const originalPassPrice = process.env.STRIPE_PRICE_PASS_ONE_TIME;
  const originalStarterMonthly = process.env.STRIPE_PRICE_STARTER_MONTHLY;
  const originalAppBaseUrl = process.env.APP_BASE_URL;

  beforeEach(() => {
    process.env.STRIPE_PRICE_PASS_ONE_TIME = "price_pass";
    process.env.STRIPE_PRICE_STARTER_MONTHLY = "price_starter_monthly";
    process.env.APP_BASE_URL = "https://app.test";
    stripeClient = new FakeStripeClient();
    subscriptions = new InMemoryOrganizationSubscriptionRepository();
    useCase = new CreateCheckoutSessionUseCase(stripeClient, subscriptions);
  });

  afterEach(() => {
    process.env.STRIPE_PRICE_PASS_ONE_TIME = originalPassPrice;
    process.env.STRIPE_PRICE_STARTER_MONTHLY = originalStarterMonthly;
    process.env.APP_BASE_URL = originalAppBaseUrl;
  });

  it("mission §3/§20 — a Pass purchase uses Stripe's payment mode, never subscription", async () => {
    await useCase.execute({ organizationId: ORG_A, actorId: "user-1", actorRole: "OWNER", target: { kind: "PASS" } });

    expect(stripeClient.checkoutSessionCalls).toHaveLength(1);
    expect(stripeClient.checkoutSessionCalls[0]).toMatchObject({ mode: "payment", priceId: "price_pass", organizationId: ORG_A });
  });

  it("a subscription purchase uses Stripe's subscription mode with the backend-resolved Price ID", async () => {
    await useCase.execute({
      organizationId: ORG_A,
      actorId: "user-1",
      actorRole: "OWNER",
      target: { kind: "SUBSCRIPTION", planTier: PlanTier.Starter, billingInterval: BillingInterval.Monthly },
    });

    expect(stripeClient.checkoutSessionCalls[0]).toMatchObject({ mode: "subscription", priceId: "price_starter_monthly", organizationId: ORG_A });
  });

  it("reuses the existing Stripe customer id when the organization already has one, never re-collects email", async () => {
    await subscriptions.save(
      OrganizationSubscription.create({
        id: "sub-1",
        organizationId: ORG_A,
        planTier: PlanTier.Starter,
        billingInterval: BillingInterval.Monthly,
        source: PlanSource.Stripe,
        stripeCustomerId: "cus_existing",
        occurredAt: FIXED_NOW,
      }),
    );

    await useCase.execute({ organizationId: ORG_A, actorId: "user-1", actorRole: "OWNER", target: { kind: "PASS" } });

    expect(stripeClient.checkoutSessionCalls[0]?.stripeCustomerId).toBe("cus_existing");
    expect(stripeClient.checkoutSessionCalls[0]?.customerEmail).toBeUndefined();
  });

  it("mission — only OWNER/ORGANIZATION_ADMIN can initiate a purchase, never engage billing as a CONTRIBUTOR", async () => {
    await expect(useCase.execute({ organizationId: ORG_A, actorId: "user-1", actorRole: "CONTRIBUTOR", target: { kind: "PASS" } })).rejects.toBeInstanceOf(
      BillingManagementPermissionMissingError,
    );
    expect(stripeClient.checkoutSessionCalls).toHaveLength(0);
  });

  it("correctif audit Codex 22C (P1-03) — successUrl/cancelUrl are ALWAYS resolved server-side from APP_BASE_URL, never accepted from the caller (no open redirect)", async () => {
    process.env.APP_BASE_URL = "https://tenderos.example.com";

    await useCase.execute({ organizationId: ORG_A, actorId: "user-1", actorRole: "OWNER", target: { kind: "PASS" } });

    const call = stripeClient.checkoutSessionCalls[0];
    expect(call?.successUrl.startsWith("https://tenderos.example.com/")).toBe(true);
    expect(call?.cancelUrl.startsWith("https://tenderos.example.com/")).toBe(true);
  });

  it("V2 Sprint 24 — defaults to the /app/subscription return path when returnTarget is absent", async () => {
    await useCase.execute({ organizationId: ORG_A, actorId: "user-1", actorRole: "OWNER", target: { kind: "PASS" } });

    const call = stripeClient.checkoutSessionCalls[0];
    expect(call?.successUrl).toBe("https://app.test/app/subscription?checkout=success");
    expect(call?.cancelUrl).toBe("https://app.test/app/subscription?checkout=canceled");
  });

  it("V2 Sprint 24 — returnTarget: 'onboarding' returns to the onboarding Paiement step instead", async () => {
    await useCase.execute({ organizationId: ORG_A, actorId: "user-1", actorRole: "OWNER", target: { kind: "PASS" }, returnTarget: "onboarding" });

    const call = stripeClient.checkoutSessionCalls[0];
    expect(call?.successUrl).toBe("https://app.test/onboarding/paiement?checkout=success");
    expect(call?.cancelUrl).toBe("https://app.test/onboarding/paiement?checkout=canceled");
  });
});
