import { describe, expect, it } from "vitest";
import { getPlanCtaHref } from "./plan-cta";

describe("getPlanCtaHref", () => {
  it("V2 Sprint 23 (landing, mission §24) — routes to /contact, never a dead /onboarding link", () => {
    expect(getPlanCtaHref("starter", "monthly")).toBe("/contact?plan=starter&billing=monthly");
  });

  it("omits the billing param when absent (Pass AO has no interval)", () => {
    expect(getPlanCtaHref("pass")).toBe("/contact?plan=pass");
  });

  it("supports the conseil (sur devis) destination even though it is not a real PlanTier", () => {
    expect(getPlanCtaHref("conseil")).toBe("/contact?plan=conseil");
  });
});
