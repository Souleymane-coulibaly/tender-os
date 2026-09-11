import { describe, expect, it } from "vitest";
import { isPortalPlanChangeDisabledError } from "./stripe-sdk.client";

describe("isPortalPlanChangeDisabledError", () => {
  it("recognizes Stripe's refusal when plan changes are disabled in the customer portal configuration (observed on staging)", () => {
    const error = Object.assign(
      new Error("This subscription cannot be updated because the subscription update feature in the portal configuration is disabled."),
      { rawType: "invalid_request_error", type: "StripeInvalidRequestError" },
    );
    expect(isPortalPlanChangeDisabledError(error)).toBe(true);
  });

  it("leaves every other Stripe invalid request alone (it stays a real, logged failure)", () => {
    const error = Object.assign(new Error("No such subscription: 'sub_123'"), { rawType: "invalid_request_error", code: "resource_missing" });
    expect(isPortalPlanChangeDisabledError(error)).toBe(false);
  });

  it("leaves non-Stripe errors alone", () => {
    expect(isPortalPlanChangeDisabledError(new Error("portal configuration is disabled"))).toBe(false);
    expect(isPortalPlanChangeDisabledError(null)).toBe(false);
  });
});
