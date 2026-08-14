import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BillingInterval } from "../../domain/billing-interval";
import { BillingManagementPermissionMissingError, NoStripeCustomerForOrganizationError } from "../../domain/errors";
import { OrganizationSubscription } from "../../domain/organization-subscription.aggregate";
import { PlanSource } from "../../domain/plan-source";
import { PlanTier } from "../../domain/plan-tier";
import { FIXED_NOW, FakeStripeClient, InMemoryOrganizationSubscriptionRepository } from "../../test-support/fakes";
import { CreateCustomerPortalSessionUseCase } from "./create-customer-portal-session.use-case";

const ORG_A = "org-a";

describe("CreateCustomerPortalSessionUseCase", () => {
  let stripeClient: FakeStripeClient;
  let subscriptions: InMemoryOrganizationSubscriptionRepository;
  let useCase: CreateCustomerPortalSessionUseCase;
  const originalAppBaseUrl = process.env.APP_BASE_URL;

  beforeEach(() => {
    process.env.APP_BASE_URL = "https://app.test";
    stripeClient = new FakeStripeClient();
    subscriptions = new InMemoryOrganizationSubscriptionRepository();
    useCase = new CreateCustomerPortalSessionUseCase(stripeClient, subscriptions);
  });

  afterEach(() => {
    process.env.APP_BASE_URL = originalAppBaseUrl;
  });

  it("opens a Customer Portal session for an organization with an active Stripe subscription", async () => {
    await subscriptions.save(
      OrganizationSubscription.create({
        id: "sub-1",
        organizationId: ORG_A,
        planTier: PlanTier.Business,
        billingInterval: BillingInterval.Monthly,
        source: PlanSource.Stripe,
        stripeCustomerId: "cus_1",
        occurredAt: FIXED_NOW,
      }),
    );

    const result = await useCase.execute({ organizationId: ORG_A, actorRole: "OWNER" });

    expect(result.url).toContain("cus_1");
    expect(stripeClient.portalSessionCalls[0]).toMatchObject({ stripeCustomerId: "cus_1" });
  });

  it("correctif audit Codex 22C (P1-03) — returnUrl is ALWAYS resolved server-side, never accepted from the caller", async () => {
    process.env.APP_BASE_URL = "https://tenderos.example.com";
    await subscriptions.save(
      OrganizationSubscription.create({
        id: "sub-1",
        organizationId: ORG_A,
        planTier: PlanTier.Business,
        billingInterval: BillingInterval.Monthly,
        source: PlanSource.Stripe,
        stripeCustomerId: "cus_1",
        occurredAt: FIXED_NOW,
      }),
    );

    await useCase.execute({ organizationId: ORG_A, actorRole: "OWNER" });

    expect(stripeClient.portalSessionCalls[0]?.returnUrl.startsWith("https://tenderos.example.com/")).toBe(true);
  });

  it("mission — never forced on a Pass: refuses when the organization has no Stripe customer at all", async () => {
    await expect(useCase.execute({ organizationId: ORG_A, actorRole: "OWNER" })).rejects.toBeInstanceOf(NoStripeCustomerForOrganizationError);
  });

  it("refuses for a role below OWNER/ORGANIZATION_ADMIN", async () => {
    await expect(useCase.execute({ organizationId: ORG_A, actorRole: "BID_MANAGER" })).rejects.toBeInstanceOf(BillingManagementPermissionMissingError);
  });
});
