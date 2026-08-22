import { beforeEach, describe, expect, it } from "vitest";
import { BillingInterval } from "../../domain/billing-interval";
import { InsufficientAoCreditsError } from "../../domain/errors";
import { OrganizationSubscription } from "../../domain/organization-subscription.aggregate";
import { PassPurchase } from "../../domain/pass-purchase.aggregate";
import { PassPurchaseStatus } from "../../domain/pass-purchase-status";
import { PlanSource } from "../../domain/plan-source";
import { PlanTier } from "../../domain/plan-tier";
import {
  FIXED_NOW,
  FakeOutboxWriter,
  InMemoryAoCreditLedgerRepository,
  InMemoryAuditLogWriter,
  InMemoryOrganizationSubscriptionRepository,
  InMemoryPassPurchaseRepository,
} from "../../test-support/fakes";
import { ConsumeAoCreditUseCase } from "./consume-ao-credit.use-case";
import { ConsumePassForTenderUseCase } from "./consume-pass-for-tender.use-case";

const ORG_A = "org-a";
const TENDER_1 = "tender-1";

describe("ConsumeAoCreditUseCase", () => {
  let subscriptions: InMemoryOrganizationSubscriptionRepository;
  let passes: InMemoryPassPurchaseRepository;
  let ledger: InMemoryAoCreditLedgerRepository;
  let auditLog: InMemoryAuditLogWriter;
  let outbox: FakeOutboxWriter;
  let useCase: ConsumeAoCreditUseCase;

  beforeEach(() => {
    subscriptions = new InMemoryOrganizationSubscriptionRepository();
    passes = new InMemoryPassPurchaseRepository();
    ledger = new InMemoryAoCreditLedgerRepository();
    auditLog = new InMemoryAuditLogWriter();
    outbox = new FakeOutboxWriter();
    const consumePassForTenderUseCase = new ConsumePassForTenderUseCase(passes, auditLog, outbox);
    useCase = new ConsumeAoCreditUseCase(subscriptions, passes, ledger, auditLog, outbox, consumePassForTenderUseCase);
  });

  it("consumes 1 AO credit from the ledger when the organization has an active finite-quota subscription with balance", async () => {
    await subscriptions.save(
      OrganizationSubscription.create({ id: "sub-1", organizationId: ORG_A, planTier: PlanTier.Starter, billingInterval: BillingInterval.Monthly, source: PlanSource.Stripe, occurredAt: FIXED_NOW }),
    );
    await ledger.grant({ organizationId: ORG_A, period: "2026-08", nominalAmount: 2, rolloverCap: 6, occurredAt: FIXED_NOW });

    await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, actorId: "user-1", occurredAt: FIXED_NOW });

    expect(await ledger.getBalance(ORG_A)).toBe(1);
    expect(auditLog.entries.some((e) => e.action === "AoCreditsConsumed")).toBe(true);
  });

  it("mission §16 — refuses when the ledger balance is 0 (blocks the caller, e.g. Tender creation)", async () => {
    await subscriptions.save(
      OrganizationSubscription.create({ id: "sub-1", organizationId: ORG_A, planTier: PlanTier.Starter, billingInterval: BillingInterval.Monthly, source: PlanSource.Stripe, occurredAt: FIXED_NOW }),
    );

    await expect(useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, actorId: "user-1", occurredAt: FIXED_NOW })).rejects.toBeInstanceOf(InsufficientAoCreditsError);
  });

  it("mission §14 — Enterprise (unlimited) is never blocked and never touches the ledger", async () => {
    await subscriptions.save(
      OrganizationSubscription.create({ id: "sub-1", organizationId: ORG_A, planTier: PlanTier.Enterprise, billingInterval: BillingInterval.Monthly, source: PlanSource.Stripe, occurredAt: FIXED_NOW }),
    );

    await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, actorId: "user-1", occurredAt: FIXED_NOW });

    expect(await ledger.getBalance(ORG_A)).toBe(0);
    const page = await ledger.list(ORG_A, { limit: 10 });
    expect(page.items).toHaveLength(0);
  });

  it("delegates to Pass consumption when there is no active subscription and a Pass is RESERVED for this tender (Checkpoint P2.3-E1.2, mission TEST 5)", async () => {
    const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_test_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
    // Reflète le flux réel : le Pass est RÉSERVÉ pour ce Tender lors d'une opération cœur AO
    // antérieure (EntitlementService.canOperateOnTender), jamais consommé directement ici.
    pass.reserveForTender(TENDER_1, FIXED_NOW);
    await passes.create(pass);

    await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, actorId: "user-1", occurredAt: FIXED_NOW });

    const consumed = await passes.findById(ORG_A, "pass-1");
    expect(consumed?.status).toBe(PassPurchaseStatus.Consumed);
    expect(consumed?.consumedTenderId).toBe(TENDER_1);
  });

  it("Checkpoint P2.3-E1.2 — refuses when a Pass exists but was never RESERVED for this tender (never picks an arbitrary AVAILABLE pass)", async () => {
    const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_test_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
    await passes.create(pass); // reste AVAILABLE, jamais réservé pour TENDER_1

    await expect(useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, actorId: "user-1", occurredAt: FIXED_NOW })).rejects.toBeInstanceOf(InsufficientAoCreditsError);
    expect((await passes.findById(ORG_A, "pass-1"))?.status).toBe(PassPurchaseStatus.Available);
  });

  it("refuses when there is no active subscription and no available Pass (mission — no free tier exists)", async () => {
    await expect(useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, actorId: "user-1", occurredAt: FIXED_NOW })).rejects.toBeInstanceOf(InsufficientAoCreditsError);
  });

  it("BLOQUANT — two concurrent consumption attempts against balance=1: exactly one succeeds, final balance is 0, never negative", async () => {
    await subscriptions.save(
      OrganizationSubscription.create({ id: "sub-1", organizationId: ORG_A, planTier: PlanTier.Starter, billingInterval: BillingInterval.Monthly, source: PlanSource.Stripe, occurredAt: FIXED_NOW }),
    );
    await ledger.grant({ organizationId: ORG_A, period: "2026-08", nominalAmount: 1, rolloverCap: 6, occurredAt: FIXED_NOW });

    const results = await Promise.allSettled([
      useCase.execute({ organizationId: ORG_A, tenderId: "tender-a", actorId: "user-1", occurredAt: FIXED_NOW }),
      useCase.execute({ organizationId: ORG_A, tenderId: "tender-b", actorId: "user-2", occurredAt: FIXED_NOW }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientAoCreditsError);

    const finalBalance = await ledger.getBalance(ORG_A);
    expect(finalBalance).toBe(0);
    expect(finalBalance).toBeGreaterThanOrEqual(0);
  });

  it("mission §53 — emits AoCreditBalanceLow when the balance reaches 2, 1, then 0, never before", async () => {
    await subscriptions.save(
      OrganizationSubscription.create({ id: "sub-1", organizationId: ORG_A, planTier: PlanTier.Starter, billingInterval: BillingInterval.Monthly, source: PlanSource.Stripe, occurredAt: FIXED_NOW }),
    );
    await ledger.grant({ organizationId: ORG_A, period: "2026-08", nominalAmount: 5, rolloverCap: 6, occurredAt: FIXED_NOW });

    await useCase.execute({ organizationId: ORG_A, tenderId: "tender-1", actorId: "user-1", occurredAt: FIXED_NOW });
    await useCase.execute({ organizationId: ORG_A, tenderId: "tender-2", actorId: "user-1", occurredAt: FIXED_NOW });
    expect(outbox.events).toHaveLength(0);

    await useCase.execute({ organizationId: ORG_A, tenderId: "tender-3", actorId: "user-1", occurredAt: FIXED_NOW });
    expect(outbox.events.map((e) => e.eventType)).toEqual(["AoCreditBalanceLow"]);
    expect(outbox.events[0]?.payload).toMatchObject({ balance: 2 });

    await useCase.execute({ organizationId: ORG_A, tenderId: "tender-4", actorId: "user-1", occurredAt: FIXED_NOW });
    await useCase.execute({ organizationId: ORG_A, tenderId: "tender-5", actorId: "user-1", occurredAt: FIXED_NOW });
    expect(outbox.events.map((e) => e.eventType)).toEqual(["AoCreditBalanceLow", "AoCreditBalanceLow", "AoCreditBalanceLow"]);
    expect(outbox.events[1]?.payload).toMatchObject({ balance: 1 });
    expect(outbox.events[2]?.payload).toMatchObject({ balance: 0 });
  });

  it("mission §14 — Enterprise (unlimited) never emits AoCreditBalanceLow", async () => {
    await subscriptions.save(
      OrganizationSubscription.create({ id: "sub-1", organizationId: ORG_A, planTier: PlanTier.Enterprise, billingInterval: BillingInterval.Monthly, source: PlanSource.Stripe, occurredAt: FIXED_NOW }),
    );

    await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, actorId: "user-1", occurredAt: FIXED_NOW });

    expect(outbox.events).toHaveLength(0);
  });

  describe("Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 4 — relocalisé au premier TenderSubmission, idempotence renforcée", () => {
    it("mission TEST 16 — a second call for the SAME tenderId (retry/resubmission after withdrawal) never consumes a second credit (ledger branch)", async () => {
      await subscriptions.save(
        OrganizationSubscription.create({ id: "sub-1", organizationId: ORG_A, planTier: PlanTier.Starter, billingInterval: BillingInterval.Monthly, source: PlanSource.Stripe, occurredAt: FIXED_NOW }),
      );
      await ledger.grant({ organizationId: ORG_A, period: "2026-08", nominalAmount: 2, rolloverCap: 6, occurredAt: FIXED_NOW });

      await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, actorId: "user-1", occurredAt: FIXED_NOW });
      expect(await ledger.getBalance(ORG_A)).toBe(1);

      // Resoumission (withdrawal -> nouveau dépôt) : le MÊME tenderId, jamais un second décompte.
      await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, actorId: "user-1", occurredAt: FIXED_NOW });
      expect(await ledger.getBalance(ORG_A)).toBe(1);
    });

    it("mission TEST 16/19 — a second call for the SAME tenderId never consumes a second Pass (Pass branch)", async () => {
      const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_test_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
      pass.reserveForTender(TENDER_1, FIXED_NOW);
      const secondPass = PassPurchase.create({ id: "pass-2", organizationId: ORG_A, externalReference: "cs_test_2", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
      await passes.create(pass);
      await passes.create(secondPass);

      await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, actorId: "user-1", occurredAt: FIXED_NOW });
      await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, actorId: "user-1", occurredAt: FIXED_NOW });

      // Le second appel n'a JAMAIS consommé le second Pass disponible — pass-1 (RÉSERVÉ pour ce
      // Tender) reste le seul consommé, pass-2 jamais touché (mission "1 Pass AO = 1 Tender / 1 AO").
      expect((await passes.findById(ORG_A, "pass-1"))?.status).toBe(PassPurchaseStatus.Consumed);
      expect((await passes.findById(ORG_A, "pass-2"))?.status).toBe(PassPurchaseStatus.Available);
    });

    it("Checkpoint TENDEROS-2.1-P2.3-E1.3, mission §6 (PASS + SUBSCRIPTION) — a Pass RESERVED for Tender A BEFORE the organization subscribes still gets consumed at Tender A's FIRST deposit, never the new subscription's ledger, never a double consumption", async () => {
      const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_test_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
      pass.reserveForTender(TENDER_1, FIXED_NOW); // réservation AVANT tout abonnement (ex. via runTenderOperationEntitled lors d'un DCE/analyse en préparation)
      await passes.create(pass);

      // L'organisation souscrit ENSUITE Starter, AVANT le premier dépôt réel de A.
      await subscriptions.save(
        OrganizationSubscription.create({ id: "sub-1", organizationId: ORG_A, planTier: PlanTier.Starter, billingInterval: BillingInterval.Monthly, source: PlanSource.Stripe, occurredAt: FIXED_NOW }),
      );
      await ledger.grant({ organizationId: ORG_A, period: "2026-08", nominalAmount: 2, rolloverCap: 6, occurredAt: FIXED_NOW });

      // Premier dépôt RÉEL de A (jamais un retry) — doit consommer le Pass déjà réservé, JAMAIS le
      // ledger d'abonnement flambant neuf, et ne jamais brûler les deux à la fois.
      await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, actorId: "user-1", occurredAt: FIXED_NOW });

      expect((await passes.findById(ORG_A, "pass-1"))?.status).toBe(PassPurchaseStatus.Consumed);
      expect((await passes.findById(ORG_A, "pass-1"))?.consumedTenderId).toBe(TENDER_1);
      expect(await ledger.getBalance(ORG_A)).toBe(2); // intact — jamais décrémenté pour ce Tender
    });

    it("cross-mechanism idempotence: consumed via Pass, then the organization subscribes to Starter — a retry for the SAME tenderId never ALSO decrements the new subscription's ledger", async () => {
      const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_test_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
      pass.reserveForTender(TENDER_1, FIXED_NOW);
      await passes.create(pass);
      await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, actorId: "user-1", occurredAt: FIXED_NOW });
      expect((await passes.findById(ORG_A, "pass-1"))?.status).toBe(PassPurchaseStatus.Consumed);

      // L'organisation souscrit ENSUITE Starter (ex. après le premier dépôt Pass) — un retry pour
      // CE MÊME Tender ne doit jamais décrémenter le nouveau ledger d'abonnement.
      await subscriptions.save(
        OrganizationSubscription.create({ id: "sub-1", organizationId: ORG_A, planTier: PlanTier.Starter, billingInterval: BillingInterval.Monthly, source: PlanSource.Stripe, occurredAt: FIXED_NOW }),
      );
      await ledger.grant({ organizationId: ORG_A, period: "2026-08", nominalAmount: 2, rolloverCap: 6, occurredAt: FIXED_NOW });

      await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, actorId: "user-1", occurredAt: FIXED_NOW });

      expect(await ledger.getBalance(ORG_A)).toBe(2);
    });
  });
});
