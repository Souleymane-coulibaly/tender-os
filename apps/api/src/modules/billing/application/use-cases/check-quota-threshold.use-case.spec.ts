import { beforeEach, describe, expect, it } from "vitest";
import type { EntitlementContext, EntitlementService } from "../services/entitlement.service";
import type { EntitlementFeature } from "../../domain/entitlement-feature";
import { PlanTier } from "../../domain/plan-tier";
import type { PlanTier as PlanTierType } from "../../domain/plan-tier";
import type { QuotaLimit, QuotaType } from "../../domain/quota-type";
import { UNLIMITED } from "../../domain/quota-type";
import { FakeOutboxWriter, InMemoryQuotaAlertRepository } from "../../test-support/fakes";
import { GetOrganizationEntitlementsUseCase } from "./get-organization-entitlements.use-case";
import { CheckQuotaThresholdUseCase } from "./check-quota-threshold.use-case";

/** Plan Pass (voir plan-catalog.ts `starterLikeQuotas`) — USERS_MAX=2, CHAT_AI_DAILY_MAX=10,
 *  STORAGE_GB_MAX=10 : des limites petites et rondes, pratiques pour tester les seuils 80/100%. */
class FakeEntitlementService implements EntitlementService {
  constructor(private readonly planTier: PlanTierType | null = PlanTier.Pass) {}
  async getEffectivePlanTier(): Promise<PlanTierType | null> {
    return this.planTier;
  }
  async canOperateOnTender(): Promise<boolean> {
    return true;
  }
  async runTenderOperationEntitled<T>(_input: unknown, operation: () => Promise<T>): Promise<T> {
    return operation();
  }
  async canUseFeature(_organizationId: string, _feature: EntitlementFeature, _context?: EntitlementContext): Promise<boolean> {
    return true;
  }
  async getEffectiveLimit(_organizationId: string, _quota: QuotaType, _context?: EntitlementContext): Promise<QuotaLimit> {
    return UNLIMITED;
  }
}

const NOW = new Date("2026-08-14T10:00:00Z");

describe("CheckQuotaThresholdUseCase", () => {
  let quotaAlertRepository: InMemoryQuotaAlertRepository;
  let outboxWriter: FakeOutboxWriter;

  function buildUseCase(planTier: PlanTierType | null = PlanTier.Pass): CheckQuotaThresholdUseCase {
    quotaAlertRepository = new InMemoryQuotaAlertRepository();
    outboxWriter = new FakeOutboxWriter();
    const getOrganizationEntitlementsUseCase = new GetOrganizationEntitlementsUseCase(new FakeEntitlementService(planTier));
    return new CheckQuotaThresholdUseCase(getOrganizationEntitlementsUseCase, quotaAlertRepository, outboxWriter as never);
  }

  beforeEach(() => {
    // rien de partagé entre les tests — chaque test appelle buildUseCase().
  });

  it("never alerts below the 80% threshold", async () => {
    const useCase = buildUseCase();
    await useCase.execute({ organizationId: "org-1", quotaType: "CHAT_AI_DAILY_MAX", used: 7, now: NOW });
    expect(outboxWriter.events).toHaveLength(0);
  });

  it("emits QuotaThresholdReached at exactly the 80% threshold", async () => {
    const useCase = buildUseCase();
    await useCase.execute({ organizationId: "org-1", quotaType: "CHAT_AI_DAILY_MAX", used: 8, now: NOW });
    expect(outboxWriter.events.map((e) => e.eventType)).toEqual(["QuotaThresholdReached"]);
    expect(outboxWriter.events[0]?.payload).toMatchObject({ quotaType: "CHAT_AI_DAILY_MAX", threshold: 80, used: 8, limit: 10 });
  });

  it("emits BOTH the 80% and 100% thresholds in the same call when usage jumps straight past both", async () => {
    const useCase = buildUseCase();
    await useCase.execute({ organizationId: "org-1", quotaType: "CHAT_AI_DAILY_MAX", used: 10, now: NOW });
    expect(outboxWriter.events.map((e) => (e.payload as { threshold: number }).threshold)).toEqual([80, 100]);
  });

  it("NEVER re-alerts the same (organization, quotaType, threshold, periodKey) twice — dedup via QuotaAlertRepository.recordIfNew", async () => {
    const useCase = buildUseCase();
    await useCase.execute({ organizationId: "org-1", quotaType: "CHAT_AI_DAILY_MAX", used: 8, now: NOW });
    await useCase.execute({ organizationId: "org-1", quotaType: "CHAT_AI_DAILY_MAX", used: 9, now: NOW });
    expect(outboxWriter.events).toHaveLength(1);
  });

  it("re-alerts on a NEW period (CHAT_AI_DAILY_MAX resets daily)", async () => {
    const useCase = buildUseCase();
    await useCase.execute({ organizationId: "org-1", quotaType: "CHAT_AI_DAILY_MAX", used: 8, now: NOW });
    const nextDay = new Date("2026-08-15T10:00:00Z");
    await useCase.execute({ organizationId: "org-1", quotaType: "CHAT_AI_DAILY_MAX", used: 8, now: nextDay });
    expect(outboxWriter.events).toHaveLength(2);
  });

  it("never alerts when the organization has no active plan (quotas === null)", async () => {
    const useCase = buildUseCase(null);
    await useCase.execute({ organizationId: "org-1", quotaType: "CHAT_AI_DAILY_MAX", used: 999, now: NOW });
    expect(outboxWriter.events).toHaveLength(0);
  });

  it("never alerts on an UNLIMITED quota", async () => {
    const useCase = buildUseCase(PlanTier.Enterprise);
    await useCase.execute({ organizationId: "org-1", quotaType: "USERS_MAX", used: 999, now: NOW });
    expect(outboxWriter.events).toHaveLength(0);
  });
});
