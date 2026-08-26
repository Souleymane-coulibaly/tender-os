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
  InMemoryAuditLogWriter,
  InMemoryEntitlementOverrideRepository,
  InMemoryOrganizationSubscriptionRepository,
  InMemoryPassPurchaseRepository,
  FakeOutboxWriter,
} from "../../test-support/fakes";
import { ReleasePassForTenderUseCase } from "../use-cases/release-pass-for-tender.use-case";
import { ReservePassForTenderUseCase } from "../use-cases/reserve-pass-for-tender.use-case";
import { DefaultEntitlementService } from "./entitlement.service";

const ORG_A = "org-a";
const TENDER_A = "tender-a";
const TENDER_B = "tender-b";

describe("DefaultEntitlementService", () => {
  let subscriptions: InMemoryOrganizationSubscriptionRepository;
  let passes: InMemoryPassPurchaseRepository;
  let overrides: InMemoryEntitlementOverrideRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let outboxWriter: FakeOutboxWriter;
  let service: DefaultEntitlementService;

  beforeEach(() => {
    subscriptions = new InMemoryOrganizationSubscriptionRepository();
    passes = new InMemoryPassPurchaseRepository();
    overrides = new InMemoryEntitlementOverrideRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    outboxWriter = new FakeOutboxWriter();
    const reservePassForTenderUseCase = new ReservePassForTenderUseCase(subscriptions, passes, auditLogWriter, outboxWriter as never);
    const releasePassForTenderUseCase = new ReleasePassForTenderUseCase(passes, auditLogWriter, outboxWriter as never);
    service = new DefaultEntitlementService(subscriptions, passes, overrides, new FixedClock(), reservePassForTenderUseCase, releasePassForTenderUseCase);
  });

  it("returns null plan and refuses every feature for an organization with no subscription and no Pass", async () => {
    expect(await service.getEffectivePlanTier(ORG_A)).toBeNull();
    expect(await service.canUseFeature(ORG_A, EntitlementFeature.AdvancedCollaboration)).toBe(false);
    expect(await service.canOperateOnTender(ORG_A, TENDER_A)).toBe(false);
  });

  /**
   * Checkpoint TENDEROS-2.1-PRE-DECOM-FIX (REC-001) — le contrat "sans plan" a change
   * DELIBEREMENT, et ce test remplace l'ancienne assertion `UsersMax === 0`.
   *
   * Auparavant TOUS les quotas valaient 0 sans plan. Or `CreateOrganizationWithOwnerUseCase` cree
   * atomiquement l'organisation ET sa Membership OWNER : l'organisation naissait donc a
   * `1 membre / 0 siege` et son propre fondateur la mettait hors quota
   * (`SEAT_LIMIT_EXCEEDED (1/0)`, constate en recette E2E). Le seul quota releve est `USERS_MAX = 1`
   * — exactement le fondateur. Tout le reste reste a ZERO : aucun credit AO, aucune fonctionnalite,
   * et `canOperateOnTender` continue de refuser. Acheter demeure l'unique voie vers un second siege.
   */
  it("BLOQUANT (REC-001) — sans plan, seul USERS_MAX vaut 1 (le fondateur) : aucun autre quota n'est accorde", async () => {
    expect(await service.getEffectiveLimit(ORG_A, QuotaType.UsersMax)).toBe(1);

    for (const quota of [QuotaType.AoMonthlyGrant, QuotaType.AoRolloverCap, QuotaType.ChatAiDailyMax, QuotaType.StorageGbMax]) {
      expect(await service.getEffectiveLimit(ORG_A, quota), `${quota} ne doit rien accorder sans plan`).toBe(0);
    }
    // L'invariant qui motive ce contrat : la limite couvre les membres crees par l'onboarding.
    expect(await service.getEffectiveLimit(ORG_A, QuotaType.UsersMax)).toBeGreaterThanOrEqual(1);
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

  describe("Checkpoint TENDEROS-2.1-P2.3-E1.3 — canOperateOnTender is PURE (correctif finding Codex P1-A)", () => {
    it("mission §12 CHECK PURE — calling canOperateOnTender 10 times against an AVAILABLE Pass never reserves it, never writes anything", async () => {
      const pass = PassPurchase.create({ id: "pass-pure", organizationId: ORG_A, externalReference: "cs_test_pure", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
      await passes.create(pass);

      for (let i = 0; i < 10; i++) {
        expect(await service.canOperateOnTender(ORG_A, TENDER_A)).toBe(true);
      }

      const stillAvailable = await passes.findById(ORG_A, "pass-pure");
      expect(stillAvailable?.status).toBe("AVAILABLE");
      expect(stillAvailable?.reservedTenderId).toBeUndefined();
      expect(auditLogWriter.entries).toHaveLength(0);
      expect(outboxWriter.events).toHaveLength(0);
    });

    it("a Pass already RESERVED for Tender A does not block Tender A's own continued operations (pure re-read, no re-reservation)", async () => {
      const pass = PassPurchase.create({ id: "pass-2", organizationId: ORG_A, externalReference: "cs_test_2", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
      pass.reserveForTender(TENDER_A, FIXED_NOW);
      await passes.create(pass);

      expect(await service.canOperateOnTender(ORG_A, TENDER_A)).toBe(true);
    });

    it("once the only Pass is CONSUMED for Tender A, a different Tender in preparation can no longer be authorized (nothing left available or reservable)", async () => {
      const pass = PassPurchase.create({ id: "pass-2b", organizationId: ORG_A, externalReference: "cs_test_2b", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
      pass.consumeForTender(TENDER_A, FIXED_NOW);
      await passes.create(pass);

      expect(await service.canOperateOnTender(ORG_A, TENDER_A)).toBe(true);
      expect(await service.canOperateOnTender(ORG_A, "tender-c")).toBe(false);
    });
  });

  describe("Checkpoint TENDEROS-2.1-P2.3-E1.3 — runTenderOperationEntitled (allocation explicite, séparée du check)", () => {
    async function noopOperation(): Promise<string> {
      return "ok";
    }

    it("mission TEST 1 — Tender A's first paying operation reserves the organization's only available Pass", async () => {
      const pass = PassPurchase.create({ id: "pass-2", organizationId: ORG_A, externalReference: "cs_test_2", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
      await passes.create(pass);

      const result = await service.runTenderOperationEntitled({ organizationId: ORG_A, tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW }, noopOperation);

      expect(result).toBe("ok");
      const reserved = await passes.findById(ORG_A, "pass-2");
      expect(reserved?.status).toBe("RESERVED");
      expect(reserved?.reservedTenderId).toBe(TENDER_A);
    });

    it("mission TEST 2 — once reserved for Tender A, the SAME Pass refuses Tender B's first paying operation (never two Tenders prepared simultaneously on one Pass)", async () => {
      const pass = PassPurchase.create({ id: "pass-2", organizationId: ORG_A, externalReference: "cs_test_2", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
      await passes.create(pass);
      await service.runTenderOperationEntitled({ organizationId: ORG_A, tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW }, noopOperation);

      await expect(service.runTenderOperationEntitled({ organizationId: ORG_A, tenderId: TENDER_B, actorId: "user-1", occurredAt: FIXED_NOW }, noopOperation)).rejects.toMatchObject({
        code: "TENDER_OPERATION_NOT_ENTITLED",
      });
    });

    it("mission TEST 3 — Tender A keeps being authorized across repeated calls (DCE, then Analysis, then Memo) — reservation is idempotent, never re-attempted", async () => {
      const pass = PassPurchase.create({ id: "pass-2", organizationId: ORG_A, externalReference: "cs_test_2", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
      await passes.create(pass);

      await service.runTenderOperationEntitled({ organizationId: ORG_A, tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW }, noopOperation);
      await service.runTenderOperationEntitled({ organizationId: ORG_A, tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW }, noopOperation);
      await service.runTenderOperationEntitled({ organizationId: ORG_A, tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW }, noopOperation);

      const reserved = await passes.findById(ORG_A, "pass-2");
      expect(reserved?.status).toBe("RESERVED"); // jamais passé à autre chose par les rappels
      expect(auditLogWriter.entries.filter((e) => e.action === "PassReservedForTender")).toHaveLength(1); // une SEULE réservation réelle
    });

    it("with TWO available Passes, Tender A and Tender B can each reserve their own — never forced to share, never a false refusal", async () => {
      const passX = PassPurchase.create({ id: "pass-x", organizationId: ORG_A, externalReference: "cs_test_x", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
      const passY = PassPurchase.create({ id: "pass-y", organizationId: ORG_A, externalReference: "cs_test_y", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
      await passes.create(passX);
      await passes.create(passY);

      await service.runTenderOperationEntitled({ organizationId: ORG_A, tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW }, noopOperation);
      await service.runTenderOperationEntitled({ organizationId: ORG_A, tenderId: TENDER_B, actorId: "user-1", occurredAt: FIXED_NOW }, noopOperation);

      const reservedTenderIds = [(await passes.findById(ORG_A, "pass-x"))?.reservedTenderId, (await passes.findById(ORG_A, "pass-y"))?.reservedTenderId].sort();
      expect(reservedTenderIds).toEqual([TENDER_A, TENDER_B].sort());
    });

    it("mission §4/§11 TEST ÉCHEC MÉTIER — a freshly-reserved Pass is released back to AVAILABLE when the operation throws, never lost to the client", async () => {
      const pass = PassPurchase.create({ id: "pass-fail", organizationId: ORG_A, externalReference: "cs_test_fail", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
      await passes.create(pass);

      await expect(
        service.runTenderOperationEntitled({ organizationId: ORG_A, tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW }, async () => {
          throw new Error("business mutation failed");
        }),
      ).rejects.toThrow("business mutation failed"); // jamais un try/catch silencieux — l'erreur d'origine ressort telle quelle

      const released = await passes.findById(ORG_A, "pass-fail");
      expect(released?.status).toBe("AVAILABLE");
      expect(released?.reservedTenderId).toBeUndefined();

      // Tender B peut désormais légitimement utiliser ce Pass — il n'a jamais été perdu.
      const forTenderB = await service.runTenderOperationEntitled({ organizationId: ORG_A, tenderId: TENDER_B, actorId: "user-1", occurredAt: FIXED_NOW }, noopOperation);
      expect(forTenderB).toBe("ok");
      expect((await passes.findById(ORG_A, "pass-fail"))?.reservedTenderId).toBe(TENDER_B);
    });

    it("a Pass already ASSIGNED (RESERVED or CONSUMED) before this call is NEVER released on a later failure — only a FRESH reservation from THIS call is compensated", async () => {
      const pass = PassPurchase.create({ id: "pass-preexisting", organizationId: ORG_A, externalReference: "cs_test_preexisting", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
      pass.reserveForTender(TENDER_A, FIXED_NOW);
      await passes.create(pass);

      await expect(
        service.runTenderOperationEntitled({ organizationId: ORG_A, tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW }, async () => {
          throw new Error("a later, unrelated operation on the SAME already-entitled tender fails");
        }),
      ).rejects.toThrow();

      const stillReserved = await passes.findById(ORG_A, "pass-preexisting");
      expect(stillReserved?.status).toBe("RESERVED");
      expect(stillReserved?.reservedTenderId).toBe(TENDER_A);
    });

    it("an active subscription never touches the Pass repository at all (SUBSCRIPTION_COVERED, no reservation attempted)", async () => {
      await subscriptions.save(
        OrganizationSubscription.create({ id: "sub-cov", organizationId: ORG_A, planTier: PlanTier.Business, billingInterval: BillingInterval.Monthly, source: PlanSource.Stripe, occurredAt: FIXED_NOW }),
      );

      const result = await service.runTenderOperationEntitled({ organizationId: ORG_A, tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW }, noopOperation);

      expect(result).toBe("ok");
      expect(auditLogWriter.entries.filter((e) => e.action === "PassReservedForTender")).toHaveLength(0);
    });
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

      // REC-001 — l'organisation de ce test n'a aucun plan : la valeur de repli attendue est donc
      // desormais la ligne de base "sans plan" (`USERS_MAX = 1`), jamais l'override expire (999).
      // Ce que ce test verrouille reste inchange : un override expire est IGNORE.
      expect(await service.getEffectiveLimit(ORG_A, QuotaType.UsersMax)).toBe(1);
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
