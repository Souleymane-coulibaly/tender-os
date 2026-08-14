import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { BillingInterval } from "../domain/billing-interval";
import { EntitlementFeature } from "../domain/entitlement-feature";
import { EntitlementOverride } from "../domain/entitlement-override.aggregate";
import { OrganizationSubscription } from "../domain/organization-subscription.aggregate";
import { PassPurchase } from "../domain/pass-purchase.aggregate";
import { PlanSource } from "../domain/plan-source";
import { PlanTier } from "../domain/plan-tier";
import { QuotaType, UNLIMITED } from "../domain/quota-type";
import { PrismaAoCreditLedgerRepository } from "./prisma-ao-credit-ledger.repository";
import { PrismaEntitlementOverrideRepository } from "./prisma-entitlement-override.repository";
import { PrismaOrganizationSubscriptionRepository } from "./prisma-organization-subscription.repository";
import { PrismaPassPurchaseRepository } from "./prisma-pass-purchase.repository";

/**
 * V2 Sprint 22 (billing, étape 22A, correctif audit Codex — après application de la migration
 * `20260813090000_v2_sprint22_billing_plans_entitlements`) — preuve PostgreSQL réelle du
 * compare-and-set de `consumeForTender` et de la contrainte unique `externalReference`, jamais
 * démontrable avec de simples fakes en mémoire. Même discipline que
 * `generation-invariants.integration.spec.ts` (Sprint 21).
 */
describe("billing module — invariantes critiques (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const subscriptionRepository = new PrismaOrganizationSubscriptionRepository(prisma);
  const passPurchaseRepository = new PrismaPassPurchaseRepository(prisma);
  const overrideRepository = new PrismaEntitlementOverrideRepository(prisma);
  const ledgerRepository = new PrismaAoCreditLedgerRepository(prisma);

  const organizationId = randomUUID();
  const now = new Date("2026-08-13T10:00:00Z");

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: { id: organizationId, name: "Billing Integration Test Org", slug: `billing-integration-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
  });

  afterAll(async () => {
    await prisma.aoCreditLedgerEntry.deleteMany({ where: { organizationId } });
    await prisma.organizationAoCreditBalance.deleteMany({ where: { organizationId } });
    await prisma.entitlementOverride.deleteMany({ where: { organizationId } });
    await prisma.organizationPassPurchase.deleteMany({ where: { organizationId } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("OrganizationSubscription.save upserts the SAME row on a second call, never a second subscription for the org (real @unique constraint)", async () => {
    await subscriptionRepository.save(
      OrganizationSubscription.create({ id: randomUUID(), organizationId, planTier: PlanTier.Starter, billingInterval: BillingInterval.Monthly, source: PlanSource.Manual, occurredAt: now }),
    );
    const first = await subscriptionRepository.findByOrganizationId(organizationId);
    expect(first?.planTier).toBe(PlanTier.Starter);

    first!.changePlan({ planTier: PlanTier.Business, billingInterval: BillingInterval.Monthly, occurredAt: now });
    await subscriptionRepository.save(first!);

    const second = await subscriptionRepository.findByOrganizationId(organizationId);
    expect(second?.id).toBe(first!.id);
    expect(second?.planTier).toBe(PlanTier.Business);
  });

  it("mission §41 — a real Postgres UNIQUE constraint on externalReference turns a duplicate insert into a conflict, never a silent second row", async () => {
    const externalReference = `cs_test_${randomUUID()}`;
    const purchase = PassPurchase.create({ id: randomUUID(), organizationId, externalReference, priceCents: 9900, currency: "EUR", occurredAt: now });
    await passPurchaseRepository.create(purchase);

    const duplicate = PassPurchase.create({ id: randomUUID(), organizationId, externalReference, priceCents: 9900, currency: "EUR", occurredAt: now });
    await expect(passPurchaseRepository.create(duplicate)).rejects.toThrow();

    const existing = await passPurchaseRepository.findByExternalReference(externalReference);
    expect(existing?.id).toBe(purchase.id);
  });

  it("BLOQUANT (réaudit — concurrence réelle) — two truly simultaneous consumeForTender calls for two different tenders: exactly one succeeds against real Postgres", async () => {
    const externalReference = `cs_test_${randomUUID()}`;
    const purchase = PassPurchase.create({ id: randomUUID(), organizationId, externalReference, priceCents: 9900, currency: "EUR", occurredAt: now });
    await passPurchaseRepository.create(purchase);

    const tenderA = randomUUID();
    const tenderB = randomUUID();

    const [resultA, resultB] = await Promise.all([
      passPurchaseRepository.consumeForTender({ organizationId, passPurchaseId: purchase.id, tenderId: tenderA, occurredAt: now }),
      passPurchaseRepository.consumeForTender({ organizationId, passPurchaseId: purchase.id, tenderId: tenderB, occurredAt: now }),
    ]);

    const appliedCount = [resultA.applied, resultB.applied].filter(Boolean).length;
    expect(appliedCount).toBe(1);

    const final = await passPurchaseRepository.findById(organizationId, purchase.id);
    expect([tenderA, tenderB]).toContain(final?.consumedTenderId);
  });

  it("EntitlementOverride round-trips a feature override through real Postgres, including the UNLIMITED quota sentinel", async () => {
    const featureOverride = EntitlementOverride.create({
      id: randomUUID(),
      organizationId,
      feature: EntitlementFeature.PublicApi,
      featureEnabled: true,
      reason: "Integration test",
      createdByPlatformAdministratorId: randomUUID(),
      occurredAt: now,
    });
    await overrideRepository.save(featureOverride);
    const activeFeature = await overrideRepository.findActiveFeatureOverride(organizationId, EntitlementFeature.PublicApi, now);
    expect(activeFeature?.featureEnabled).toBe(true);

    const quotaOverride = EntitlementOverride.create({
      id: randomUUID(),
      organizationId,
      quota: QuotaType.UsersMax,
      quotaLimit: UNLIMITED,
      reason: "Integration test",
      createdByPlatformAdministratorId: randomUUID(),
      occurredAt: now,
    });
    await overrideRepository.save(quotaOverride);
    const activeQuota = await overrideRepository.findActiveQuotaOverride(organizationId, QuotaType.UsersMax, now);
    expect(activeQuota?.quotaLimit).toBe(UNLIMITED);
  });

  describe("AO credit ledger (étape 22B)", () => {
    it("grant is idempotent per (organizationId, period) against the real partial unique index", async () => {
      const period = "2026-08";
      const first = await ledgerRepository.grant({ organizationId, period, nominalAmount: 2, rolloverCap: 6, occurredAt: now });
      const second = await ledgerRepository.grant({ organizationId, period, nominalAmount: 2, rolloverCap: 6, occurredAt: now });

      expect(first.alreadyApplied).toBe(false);
      expect(second.alreadyApplied).toBe(true);
      expect(second.entry.id).toBe(first.entry.id);
      expect(await ledgerRepository.getBalance(organizationId)).toBe(2);
    });

    it("BLOQUANT (mission §16 — concurrence réelle) — two truly simultaneous consume calls against balance=1: exactly one succeeds, final balance is 0, never negative", async () => {
      await ledgerRepository.grant({ organizationId, period: "2026-09", nominalAmount: 1, rolloverCap: 6, occurredAt: now });
      expect(await ledgerRepository.getBalance(organizationId)).toBe(3); // cumulative with the previous grant test (2 + 1)

      // Ramène le solde à exactement 1 pour un test de concurrence net et lisible.
      await ledgerRepository.consume({ organizationId, tenderId: randomUUID(), amount: 2, occurredAt: now });
      expect(await ledgerRepository.getBalance(organizationId)).toBe(1);

      const tenderA = randomUUID();
      const tenderB = randomUUID();
      const [resultA, resultB] = await Promise.all([
        ledgerRepository.consume({ organizationId, tenderId: tenderA, amount: 1, occurredAt: now }),
        ledgerRepository.consume({ organizationId, tenderId: tenderB, amount: 1, occurredAt: now }),
      ]);

      const appliedCount = [resultA.applied, resultB.applied].filter(Boolean).length;
      expect(appliedCount).toBe(1);

      const finalBalance = await ledgerRepository.getBalance(organizationId);
      expect(finalBalance).toBe(0);
      expect(finalBalance).toBeGreaterThanOrEqual(0);
    });

    it("BLOQUANT (correctif audit Codex 22B P1-01 — concurrence réelle) — two truly simultaneous reverseConsumption calls on the SAME tenderId: exactly one succeeds against real Postgres, balance credited only once", async () => {
      await ledgerRepository.grant({ organizationId, period: "2026-10", nominalAmount: 2, rolloverCap: 60, occurredAt: now });
      const tenderId = randomUUID();
      await ledgerRepository.consume({ organizationId, tenderId, amount: 1, occurredAt: now });
      const balanceBeforeReversal = await ledgerRepository.getBalance(organizationId);

      const [resultA, resultB] = await Promise.allSettled([
        ledgerRepository.reverseConsumption({ organizationId, tenderId, reason: "Attempt A", actorPlatformAdministratorId: randomUUID(), occurredAt: now }),
        ledgerRepository.reverseConsumption({ organizationId, tenderId, reason: "Attempt B", actorPlatformAdministratorId: randomUUID(), occurredAt: now }),
      ]);

      const fulfilledCount = [resultA, resultB].filter((r) => r.status === "fulfilled").length;
      expect(fulfilledCount).toBe(1);

      // La transaction perdante doit avoir été intégralement annulée (y compris son incrément de
      // solde) — jamais un double crédit malgré l'échec de son seul INSERT.
      expect(await ledgerRepository.getBalance(organizationId)).toBe(balanceBeforeReversal + 1);
    });

    it("BLOQUANT (correctif audit Codex 22B P1-02) — an adjustment that would take the balance negative is refused against real Postgres, never silently clamped", async () => {
      await ledgerRepository.grant({ organizationId, period: "2026-11", nominalAmount: 2, rolloverCap: 60, occurredAt: now });
      const balanceBefore = await ledgerRepository.getBalance(organizationId);

      await expect(
        ledgerRepository.adjust({ organizationId, amount: -(balanceBefore + 100), reason: "Correction trop importante", actorPlatformAdministratorId: randomUUID(), occurredAt: now }),
      ).rejects.toThrow();

      expect(await ledgerRepository.getBalance(organizationId)).toBe(balanceBefore);
    });
  });
});
