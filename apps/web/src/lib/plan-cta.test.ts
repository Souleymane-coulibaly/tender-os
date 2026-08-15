import { describe, expect, it } from "vitest";
import { getPlanCtaHref } from "./plan-cta";

describe("getPlanCtaHref", () => {
  it("V2 Sprint 24 (onboarding) — routes to /onboarding with the plan/billing preserved", () => {
    expect(getPlanCtaHref("starter", "monthly")).toBe("/onboarding?plan=STARTER&billing=MONTHLY");
  });

  it("omits the billing param when absent", () => {
    expect(getPlanCtaHref("business")).toBe("/onboarding?plan=BUSINESS");
  });

  it("routes the Pass AO to /onboarding?offer=pass, never a plan= param", () => {
    expect(getPlanCtaHref("pass")).toBe("/onboarding?offer=pass");
  });

  it("ignores a billing interval for the Pass AO (no interval concept for a one-time purchase)", () => {
    expect(getPlanCtaHref("pass", "yearly")).toBe("/onboarding?offer=pass");
  });

  it("keeps the conseil (sur devis) destination on /contact — no self-service offer to route into onboarding", () => {
    expect(getPlanCtaHref("conseil")).toBe("/contact?plan=conseil");
  });
});
