import { describe, expect, it } from "vitest";
import { BillingInterval } from "./billing-interval";
import { EntitlementFeature } from "./entitlement-feature";
import { getPlanQuotaLimit, planHasFeature, PLAN_CATALOG, resolvePriceCents } from "./plan-catalog";
import { PlanTier } from "./plan-tier";
import { QuotaType, UNLIMITED } from "./quota-type";

describe("PLAN_CATALOG", () => {
  it("prices Pass at 99€ HT one-time, never a monthly/yearly price", () => {
    const entry = PLAN_CATALOG[PlanTier.Pass];
    expect(entry.onePriceCents).toBe(9900);
    expect(entry.monthlyPriceCents).toBeNull();
    expect(entry.yearlyPriceCents).toBeNull();
    expect(entry.billingIntervalsSupported).toHaveLength(0);
  });

  it("mission §17 — annual price is exactly 11× the monthly price for every subscription plan", () => {
    for (const tier of [PlanTier.Starter, PlanTier.Business, PlanTier.Enterprise]) {
      const entry = PLAN_CATALOG[tier];
      expect(entry.yearlyPriceCents).toBe((entry.monthlyPriceCents ?? 0) * 11);
    }
  });

  it("mission — exact catalog prices (Starter 199€, Business 599€, Enterprise 1099€)", () => {
    expect(resolvePriceCents(PlanTier.Starter, BillingInterval.Monthly)).toBe(19900);
    expect(resolvePriceCents(PlanTier.Business, BillingInterval.Monthly)).toBe(59900);
    expect(resolvePriceCents(PlanTier.Enterprise, BillingInterval.Monthly)).toBe(109900);
    expect(resolvePriceCents(PlanTier.Business, BillingInterval.Yearly)).toBe(658900);
  });

  it("Pass never includes any of the differentiator features, identically to Starter", () => {
    for (const feature of Object.values(EntitlementFeature)) {
      expect(planHasFeature(PlanTier.Pass, feature)).toBe(false);
      expect(planHasFeature(PlanTier.Starter, feature)).toBe(false);
    }
  });

  it("only Business and Enterprise unlock Advanced Collaboration / Approval Workflows", () => {
    expect(planHasFeature(PlanTier.Business, EntitlementFeature.AdvancedCollaboration)).toBe(true);
    expect(planHasFeature(PlanTier.Business, EntitlementFeature.ApprovalWorkflows)).toBe(true);
    expect(planHasFeature(PlanTier.Business, EntitlementFeature.PublicApi)).toBe(false);
    expect(planHasFeature(PlanTier.Business, EntitlementFeature.Webhooks)).toBe(false);
    expect(planHasFeature(PlanTier.Business, EntitlementFeature.AutomationConnectors)).toBe(false);
  });

  it("only Enterprise unlocks Public API / Webhooks / Automation Connectors", () => {
    for (const feature of Object.values(EntitlementFeature)) {
      expect(planHasFeature(PlanTier.Enterprise, feature)).toBe(true);
    }
  });

  it("Pass quotas are capped at Starter level, never Business (mission §8)", () => {
    expect(getPlanQuotaLimit(PlanTier.Pass, QuotaType.UsersMax)).toBe(getPlanQuotaLimit(PlanTier.Starter, QuotaType.UsersMax));
    expect(getPlanQuotaLimit(PlanTier.Pass, QuotaType.ChatAiDailyMax)).toBe(getPlanQuotaLimit(PlanTier.Starter, QuotaType.ChatAiDailyMax));
    expect(getPlanQuotaLimit(PlanTier.Pass, QuotaType.StorageGbMax)).toBe(getPlanQuotaLimit(PlanTier.Starter, QuotaType.StorageGbMax));
    expect(getPlanQuotaLimit(PlanTier.Pass, QuotaType.UsersMax)).toBeLessThan(getPlanQuotaLimit(PlanTier.Business, QuotaType.UsersMax) as number);
  });

  it("Pass carries no recurring AO grant — the single credit lives on OrganizationPassPurchase, never the ledger", () => {
    expect(getPlanQuotaLimit(PlanTier.Pass, QuotaType.AoMonthlyGrant)).toBe(0);
    expect(getPlanQuotaLimit(PlanTier.Pass, QuotaType.AoRolloverCap)).toBe(0);
  });

  it("Enterprise AO/users are fair-use unlimited, never a hardcoded large number", () => {
    expect(getPlanQuotaLimit(PlanTier.Enterprise, QuotaType.AoMonthlyGrant)).toBe(UNLIMITED);
    expect(getPlanQuotaLimit(PlanTier.Enterprise, QuotaType.UsersMax)).toBe(UNLIMITED);
    expect(getPlanQuotaLimit(PlanTier.Enterprise, QuotaType.ChatAiDailyMax)).toBe(300);
    expect(getPlanQuotaLimit(PlanTier.Enterprise, QuotaType.StorageGbMax)).toBe(300);
  });

  it("Starter/Business rollover caps match the mission's worked examples", () => {
    expect(getPlanQuotaLimit(PlanTier.Starter, QuotaType.AoMonthlyGrant)).toBe(2);
    expect(getPlanQuotaLimit(PlanTier.Starter, QuotaType.AoRolloverCap)).toBe(6);
    expect(getPlanQuotaLimit(PlanTier.Business, QuotaType.AoMonthlyGrant)).toBe(10);
    expect(getPlanQuotaLimit(PlanTier.Business, QuotaType.AoRolloverCap)).toBe(60);
  });
});
