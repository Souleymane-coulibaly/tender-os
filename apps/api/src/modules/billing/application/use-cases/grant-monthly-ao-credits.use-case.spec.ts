import { beforeEach, describe, expect, it } from "vitest";
import { BillingInterval } from "../../domain/billing-interval";
import { AoCreditGrantNotApplicableError, SubscriptionNotFoundError } from "../../domain/errors";
import { OrganizationSubscription } from "../../domain/organization-subscription.aggregate";
import { PlanSource } from "../../domain/plan-source";
import { PlanTier } from "../../domain/plan-tier";
import { FIXED_NOW, InMemoryAoCreditLedgerRepository, InMemoryAuditLogWriter, InMemoryOrganizationSubscriptionRepository } from "../../test-support/fakes";
import { GrantMonthlyAoCreditsUseCase } from "./grant-monthly-ao-credits.use-case";

const ORG_A = "org-a";

async function withSubscription(subscriptions: InMemoryOrganizationSubscriptionRepository, planTier: string, id = "sub-1") {
  await subscriptions.save(
    OrganizationSubscription.create({ id, organizationId: ORG_A, planTier: planTier as never, billingInterval: BillingInterval.Monthly, source: PlanSource.Stripe, occurredAt: FIXED_NOW }),
  );
}

function month(offset: number): string {
  const date = new Date(Date.UTC(2026, offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

describe("GrantMonthlyAoCreditsUseCase", () => {
  let subscriptions: InMemoryOrganizationSubscriptionRepository;
  let ledger: InMemoryAoCreditLedgerRepository;
  let auditLog: InMemoryAuditLogWriter;
  let useCase: GrantMonthlyAoCreditsUseCase;

  beforeEach(() => {
    subscriptions = new InMemoryOrganizationSubscriptionRepository();
    ledger = new InMemoryAoCreditLedgerRepository();
    auditLog = new InMemoryAuditLogWriter();
    useCase = new GrantMonthlyAoCreditsUseCase(subscriptions, ledger, auditLog);
  });

  it("mission — Starter rollover math: M1=2, M2=4, M3=6, M4=6 (caps at 6)", async () => {
    await withSubscription(subscriptions, PlanTier.Starter);

    const m1 = await useCase.execute({ organizationId: ORG_A, period: month(0), actorId: "system", occurredAt: FIXED_NOW });
    expect(m1.entry.balanceAfter).toBe(2);
    const m2 = await useCase.execute({ organizationId: ORG_A, period: month(1), actorId: "system", occurredAt: FIXED_NOW });
    expect(m2.entry.balanceAfter).toBe(4);
    const m3 = await useCase.execute({ organizationId: ORG_A, period: month(2), actorId: "system", occurredAt: FIXED_NOW });
    expect(m3.entry.balanceAfter).toBe(6);
    const m4 = await useCase.execute({ organizationId: ORG_A, period: month(3), actorId: "system", occurredAt: FIXED_NOW });
    expect(m4.entry.balanceAfter).toBe(6);
    expect(m4.entry.amount).toBe(0);
  });

  it("mission — Business rollover math: 10,20,30,40,50,60,60 (caps at 60)", async () => {
    await withSubscription(subscriptions, PlanTier.Business);

    const expected = [10, 20, 30, 40, 50, 60, 60];
    for (let i = 0; i < expected.length; i++) {
      const { entry } = await useCase.execute({ organizationId: ORG_A, period: month(i), actorId: "system", occurredAt: FIXED_NOW });
      expect(entry.balanceAfter).toBe(expected[i]);
    }
  });

  it("mission — Business consumption example: balance 60, consume 7 -> 53, next grant +10 -> 60", async () => {
    await withSubscription(subscriptions, PlanTier.Business);
    for (let i = 0; i < 6; i++) {
      await useCase.execute({ organizationId: ORG_A, period: month(i), actorId: "system", occurredAt: FIXED_NOW });
    }
    expect(await ledger.getBalance(ORG_A)).toBe(60);

    await ledger.consume({ organizationId: ORG_A, tenderId: "tender-1", amount: 7, occurredAt: FIXED_NOW });
    expect(await ledger.getBalance(ORG_A)).toBe(53);

    const nextGrant = await useCase.execute({ organizationId: ORG_A, period: month(6), actorId: "system", occurredAt: FIXED_NOW });
    expect(nextGrant.entry.amount).toBe(7);
    expect(nextGrant.entry.balanceAfter).toBe(60);
  });

  it("mission §17 — annual billing: credits are still granted ONE MONTH AT A TIME, never all upfront", async () => {
    await withSubscription(subscriptions, PlanTier.Business, "sub-annual");

    const m1 = await useCase.execute({ organizationId: ORG_A, period: month(0), actorId: "system", occurredAt: FIXED_NOW });
    expect(m1.entry.amount).toBe(10);
    expect(m1.entry.balanceAfter).toBe(10);
    // Jamais +120 upfront (10 * 12) même pour un abonnement annuel — un seul grant existe pour M1.
    expect(await ledger.getBalance(ORG_A)).toBe(10);
  });

  it("is idempotent per (organization, period): a second call for the SAME month never grants twice, never audits twice", async () => {
    await withSubscription(subscriptions, PlanTier.Starter);

    const first = await useCase.execute({ organizationId: ORG_A, period: month(0), actorId: "system", occurredAt: FIXED_NOW });
    const second = await useCase.execute({ organizationId: ORG_A, period: month(0), actorId: "system", occurredAt: FIXED_NOW });

    expect(first.alreadyApplied).toBe(false);
    expect(second.alreadyApplied).toBe(true);
    expect(second.entry.id).toBe(first.entry.id);
    expect(await ledger.getBalance(ORG_A)).toBe(2);
    expect(auditLog.entries.filter((e) => e.action === "AoCreditsGranted")).toHaveLength(1);
  });

  it("refuses to grant for a plan with no active subscription", async () => {
    await expect(useCase.execute({ organizationId: ORG_A, period: month(0), actorId: "system", occurredAt: FIXED_NOW })).rejects.toBeInstanceOf(SubscriptionNotFoundError);
  });

  it("mission §14 — Enterprise never uses the ledger (unlimited fair-use, never a numeric grant)", async () => {
    await withSubscription(subscriptions, PlanTier.Enterprise);

    await expect(useCase.execute({ organizationId: ORG_A, period: month(0), actorId: "system", occurredAt: FIXED_NOW })).rejects.toBeInstanceOf(AoCreditGrantNotApplicableError);
  });
});
