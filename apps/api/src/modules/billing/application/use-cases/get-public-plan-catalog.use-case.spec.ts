import { describe, expect, it } from "vitest";
import { PlanTier } from "../../domain/plan-tier";
import { UNLIMITED } from "../../domain/quota-type";
import { GetPublicPlanCatalogUseCase } from "./get-public-plan-catalog.use-case";

describe("GetPublicPlanCatalogUseCase", () => {
  it("V2 Sprint 23 (landing) — exposes the 4 real PlanTier entries, never a second hardcoded catalogue", () => {
    const useCase = new GetPublicPlanCatalogUseCase();

    const entries = useCase.execute();

    expect(entries.map((entry) => entry.tier)).toEqual([PlanTier.Pass, PlanTier.Starter, PlanTier.Business, PlanTier.Enterprise]);
  });

  it("reflects the REAL catalogue values (Starter monthly price, Business quotas) — never stale/duplicated numbers", () => {
    const useCase = new GetPublicPlanCatalogUseCase();

    const entries = useCase.execute();
    const starter = entries.find((entry) => entry.tier === PlanTier.Starter);
    const business = entries.find((entry) => entry.tier === PlanTier.Business);
    const enterprise = entries.find((entry) => entry.tier === PlanTier.Enterprise);

    expect(starter?.monthlyPriceCents).toBe(19900);
    expect(starter?.yearlyPriceCents).toBe(19900 * 11);
    expect(business?.quotas.USERS_MAX).toBe(10);
    expect(enterprise?.quotas.USERS_MAX).toBe(UNLIMITED);
  });

  it("converts entitlements Set to a plain array (never a Set, not JSON-serializable as intended)", () => {
    const useCase = new GetPublicPlanCatalogUseCase();

    const entries = useCase.execute();
    const business = entries.find((entry) => entry.tier === PlanTier.Business);

    expect(Array.isArray(business?.entitlements)).toBe(true);
    expect(business?.entitlements).toContain("ADVANCED_COLLABORATION");
  });
});
