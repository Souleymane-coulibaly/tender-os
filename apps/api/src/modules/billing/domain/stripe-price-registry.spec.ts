import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BillingInterval } from "./billing-interval";
import { StripePriceNotConfiguredError } from "./errors";
import { PlanTier } from "./plan-tier";
import { resolvePlanFromStripePriceId, resolveStripePassPriceId, resolveStripeSubscriptionPriceId } from "./stripe-price-registry";

const ENV_VARS = [
  "STRIPE_PRICE_STARTER_MONTHLY",
  "STRIPE_PRICE_STARTER_YEARLY",
  "STRIPE_PRICE_BUSINESS_MONTHLY",
  "STRIPE_PRICE_BUSINESS_YEARLY",
  "STRIPE_PRICE_ENTERPRISE_MONTHLY",
  "STRIPE_PRICE_ENTERPRISE_YEARLY",
  "STRIPE_PRICE_PASS_ONE_TIME",
] as const;

describe("stripe-price-registry", () => {
  const originalValues: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_VARS) {
      originalValues[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_VARS) {
      if (originalValues[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValues[key];
      }
    }
  });

  it("resolves the 6 recurring subscription Price IDs from their dedicated environment variables", () => {
    process.env.STRIPE_PRICE_STARTER_MONTHLY = "price_starter_monthly";
    process.env.STRIPE_PRICE_BUSINESS_YEARLY = "price_business_yearly";
    process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY = "price_enterprise_monthly";

    expect(resolveStripeSubscriptionPriceId(PlanTier.Starter, BillingInterval.Monthly)).toBe("price_starter_monthly");
    expect(resolveStripeSubscriptionPriceId(PlanTier.Business, BillingInterval.Yearly)).toBe("price_business_yearly");
    expect(resolveStripeSubscriptionPriceId(PlanTier.Enterprise, BillingInterval.Monthly)).toBe("price_enterprise_monthly");
  });

  it("resolves the 1 one-time Pass Price ID", () => {
    process.env.STRIPE_PRICE_PASS_ONE_TIME = "price_pass_one_time";
    expect(resolveStripePassPriceId()).toBe("price_pass_one_time");
  });

  it("mission — never fails at boot for a missing Price env var, only at actual resolution time", () => {
    expect(() => resolveStripeSubscriptionPriceId(PlanTier.Starter, BillingInterval.Monthly)).toThrow(StripePriceNotConfiguredError);
    expect(() => resolveStripePassPriceId()).toThrow(StripePriceNotConfiguredError);
  });

  it("resolves the plan tier/interval back from a known Price ID (webhook direction)", () => {
    process.env.STRIPE_PRICE_BUSINESS_MONTHLY = "price_business_monthly";
    expect(resolvePlanFromStripePriceId("price_business_monthly")).toEqual({ planTier: PlanTier.Business, billingInterval: BillingInterval.Monthly });
  });

  it("returns null for an unrecognized Price ID, never guesses", () => {
    process.env.STRIPE_PRICE_BUSINESS_MONTHLY = "price_business_monthly";
    expect(resolvePlanFromStripePriceId("price_unknown")).toBeNull();
  });
});
