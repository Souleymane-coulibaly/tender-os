import { beforeEach, describe, expect, it } from "vitest";
import { BillingInterval } from "../../domain/billing-interval";
import { EntitlementFeature } from "../../domain/entitlement-feature";
import { EntitlementOverride } from "../../domain/entitlement-override.aggregate";
import { OrganizationSubscription } from "../../domain/organization-subscription.aggregate";
import { PassPurchase } from "../../domain/pass-purchase.aggregate";
import { PlanSource } from "../../domain/plan-source";
import { PlanTier } from "../../domain/plan-tier";
import { QuotaType, UNLIMITED } from "../../domain/quota-type";
import {
  FIXED_NOW,
  FixedClock,
  InMemoryEntitlementOverrideRepository,
  InMemoryOrganizationSubscriptionRepository,
  InMemoryPassPurchaseRepository,
} from "../../test-support/fakes";
import { DefaultEntitlementService } from "./entitlement.service";

const ORG_A = "org-a";
const TENDER_A = "tender-a";
const TENDER_B = "tender-b";

describe("DefaultEntitlementService", () => {
  let subscriptions: InMemoryOrganizationSubscriptionRepository;
  let passes: InMemoryPassPurchaseRepository;
  let overrides: InMemoryEntitlementOverrideRepository;
  let service: DefaultEntitlementService;

  beforeEach(() => {
    subscriptions = new InMemoryOrganizationSubscriptionRepository();
    passes = new InMemoryPassPurchaseRepository();
    overrides = new InMemoryEntitlementOverrideRepository();
    service = new DefaultEntitlementService(subscriptions, passes, overrides, new FixedClock());
  });

  it("returns null plan and refuses every feature/limit for an organization with no subscription and no Pass", async () => {
    expect(await service.getEffectivePlanTier(ORG_A)).toBeNull();
    expect(await service.canUseFeature(ORG_A, EntitlementFeature.AdvancedCollaboration)).toBe(false);
    expect(await service.getEffectiveLimit(ORG_A, QuotaType.UsersMax)).toBe(0);
    expect(await service.canOperateOnTender(ORG_A, TENDER_A)).toBe(false);
  });

  it("Business subscription grants Advanced Collaboration but never Public API", async () => {
    await subscriptions.save(
      OrganizationSubscription.create({
        id: "sub-1",
        organizationId: ORG_A,
        planTier: PlanTier.Business,
        billingInterval: BillingInterval.Monthly,
        source: PlanSource.Stripe,
        occurredAt: FIXED_NOW,
      }),
    );

    expect(await service.canUseFeature(ORG_A, EntitlementFeature.AdvancedCollaboration)).toBe(true);
    expect(await service.canUseFeature(ORG_A, EntitlementFeature.PublicApi)).toBe(false);
    expect(await service.getEffectiveLimit(ORG_A, QuotaType.UsersMax)).toBe(10);
    expect(await service.canOperateOnTender(ORG_A, TENDER_A)).toBe(true);
    expect(await service.canOperateOnTender(ORG_A, TENDER_B)).toBe(true);
  });

  it("a canceled subscription grants nothing (never silently active)", async () => {
    const subscription = OrganizationSubscription.create({
      id: "sub-2",
      organizationId: ORG_A,
      planTier: PlanTier.Enterprise,
      billingInterval: BillingInterval.Yearly,
      source: PlanSource.Stripe,
      occurredAt: FIXED_NOW,
    });
    subscription.cancel(FIXED_NOW);
    await subscriptions.save(subscription);

    expect(await service.getEffectivePlanTier(ORG_A)).toBeNull();
    expect(await service.canOperateOnTender(ORG_A, TENDER_A)).toBe(false);
  });

  it("Enterprise reports UNLIMITED for AO/users but a finite number for chat/storage", async () => {
    await subscriptions.save(
      OrganizationSubscription.create({
        id: "sub-3",
        organizationId: ORG_A,
        planTier: PlanTier.Enterprise,
        billingInterval: BillingInterval.Monthly,
        source: PlanSource.Stripe,
        occurredAt: FIXED_NOW,
      }),
    );

    expect(await service.getEffectiveLimit(ORG_A, QuotaType.UsersMax)).toBe(UNLIMITED);
    expect(await service.getEffectiveLimit(ORG_A, QuotaType.ChatAiDailyMax)).toBe(300);
  });

  describe("mission §22 — Pass-scope isolation (BLOQUANT security test)", () => {
    beforeEach(async () => {
      const pass = PassPurchase.create({
        id: "pass-1",
        organizationId: ORG_A,
        externalReference: "cs_test_1",
        priceCents: 9900,
        currency: "EUR",
        occurredAt: FIXED_NOW,
      });
      pass.consumeForTender(TENDER_A, FIXED_NOW);
      await passes.create(pass);
    });

    it("allows operating on the Tender the Pass was consumed for", async () => {
      expect(await service.canOperateOnTender(ORG_A, TENDER_A)).toBe(true);
    });

    it("refuses operating on a DIFFERENT Tender in the SAME organization, even though a Pass exists", async () => {
      expect(await service.canOperateOnTender(ORG_A, TENDER_B)).toBe(false);
    });

    it("resolves the org-wide baseline plan as PASS from any tender (org-wide quotas like UsersMax are not tender-scoped)", async () => {
      expect(await service.getEffectivePlanTier(ORG_A)).toBe(PlanTier.Pass);
      expect(await service.getEffectiveLimit(ORG_A, QuotaType.UsersMax)).toBe(2);
    });

    it("canUseFeature with a tenderId context refuses a feature on Tender B even though it would be refused on Tender A too (Pass has no differentiator features)", async () => {
      expect(await service.canUseFeature(ORG_A, EntitlementFeature.AdvancedCollaboration, { tenderId: TENDER_A })).toBe(false);
      expect(await service.canUseFeature(ORG_A, EntitlementFeature.AdvancedCollaboration, { tenderId: TENDER_B })).toBe(false);
    });
  });

  it("an organization with an AVAILABLE (unconsumed) Pass cannot operate on any tender yet", async () => {
    const pass = PassPurchase.create({
      id: "pass-2",
      organizationId: ORG_A,
      externalReference: "cs_test_2",
      priceCents: 9900,
      currency: "EUR",
      occurredAt: FIXED_NOW,
    });
    await passes.create(pass);

    expect(await service.canOperateOnTender(ORG_A, TENDER_A)).toBe(false);
    // Mais le plan de base de l'organisation est déjà résolu comme PASS (mission §36 — l'achat existe).
    expect(await service.getEffectivePlanTier(ORG_A)).toBe(PlanTier.Pass);
  });

  describe("correctif audit Codex 22A (P1-02) — précédence override", () => {
    it("mission §38 — a Business org with an active PUBLIC_API=true override gets the feature, even though Business never includes it by catalog", async () => {
      await subscriptions.save(
        OrganizationSubscription.create({ id: "sub-4", organizationId: ORG_A, planTier: PlanTier.Business, billingInterval: BillingInterval.Monthly, source: PlanSource.Stripe, occurredAt: FIXED_NOW }),
      );
      expect(await service.canUseFeature(ORG_A, EntitlementFeature.PublicApi)).toBe(false);

      await overrides.save(
        EntitlementOverride.create({
          id: "override-1",
          organizationId: ORG_A,
          feature: EntitlementFeature.PublicApi,
          featureEnabled: true,
          reason: "Pilote négocié manuellement",
          createdByPlatformAdministratorId: "admin-1",
          occurredAt: FIXED_NOW,
        }),
      );

      expect(await service.canUseFeature(ORG_A, EntitlementFeature.PublicApi)).toBe(true);
    });

    it("an override can also RESTRICT a feature the catalog would otherwise grant", async () => {
      await subscriptions.save(
        OrganizationSubscription.create({ id: "sub-5", organizationId: ORG_A, planTier: PlanTier.Enterprise, billingInterval: BillingInterval.Monthly, source: PlanSource.Stripe, occurredAt: FIXED_NOW }),
      );
      await overrides.save(
        EntitlementOverride.create({
          id: "override-2",
          organizationId: ORG_A,
          feature: EntitlementFeature.Webhooks,
          featureEnabled: false,
          reason: "Incident de sécurité en cours d'investigation",
          createdByPlatformAdministratorId: "admin-1",
          occurredAt: FIXED_NOW,
        }),
      );

      expect(await service.canUseFeature(ORG_A, EntitlementFeature.Webhooks)).toBe(false);
    });

    it("an expired override is ignored — falls back to the catalog value", async () => {
      await overrides.save(
        EntitlementOverride.create({
          id: "override-3",
          organizationId: ORG_A,
          quota: QuotaType.UsersMax,
          quotaLimit: 999,
          reason: "Test temporaire",
          createdByPlatformAdministratorId: "admin-1",
          expiresAt: new Date(FIXED_NOW.getTime() - 1000),
          occurredAt: new Date(FIXED_NOW.getTime() - 10_000),
        }),
      );

      expect(await service.getEffectiveLimit(ORG_A, QuotaType.UsersMax)).toBe(0);
    });

    it("mission §39 — a feature override never grants access to a different Tender (Pass-scope is untouched)", async () => {
      const pass = PassPurchase.create({ id: "pass-3", organizationId: ORG_A, externalReference: "cs_test_override", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
      pass.consumeForTender(TENDER_A, FIXED_NOW);
      await passes.create(pass);
      await overrides.save(
        EntitlementOverride.create({
          id: "override-4",
          organizationId: ORG_A,
          feature: EntitlementFeature.AdvancedCollaboration,
          featureEnabled: true,
          reason: "Test",
          createdByPlatformAdministratorId: "admin-1",
          occurredAt: FIXED_NOW,
        }),
      );

      expect(await service.canUseFeature(ORG_A, EntitlementFeature.AdvancedCollaboration, { tenderId: TENDER_B })).toBe(false);
      expect(await service.canOperateOnTender(ORG_A, TENDER_B)).toBe(false);
    });
  });
});
