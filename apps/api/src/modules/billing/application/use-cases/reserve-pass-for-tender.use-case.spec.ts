import { beforeEach, describe, expect, it } from "vitest";
import { BillingInterval } from "../../domain/billing-interval";
import { OrganizationSubscription } from "../../domain/organization-subscription.aggregate";
import { PassPurchase } from "../../domain/pass-purchase.aggregate";
import { PlanSource } from "../../domain/plan-source";
import { PlanTier } from "../../domain/plan-tier";
import { FIXED_NOW, FakeOutboxWriter, InMemoryAuditLogWriter, InMemoryOrganizationSubscriptionRepository, InMemoryPassPurchaseRepository } from "../../test-support/fakes";
import { ReservePassForTenderUseCase } from "./reserve-pass-for-tender.use-case";

const ORG_A = "org-a";
const TENDER_A = "tender-a";
const TENDER_B = "tender-b";

describe("ReservePassForTenderUseCase", () => {
  let subscriptions: InMemoryOrganizationSubscriptionRepository;
  let passes: InMemoryPassPurchaseRepository;
  let auditLog: InMemoryAuditLogWriter;
  let outbox: FakeOutboxWriter;
  let useCase: ReservePassForTenderUseCase;

  beforeEach(() => {
    subscriptions = new InMemoryOrganizationSubscriptionRepository();
    passes = new InMemoryPassPurchaseRepository();
    auditLog = new InMemoryAuditLogWriter();
    outbox = new FakeOutboxWriter();
    useCase = new ReservePassForTenderUseCase(subscriptions, passes, auditLog, outbox);
  });

  it("returns SUBSCRIPTION_COVERED and never touches the Pass repository when the organization has an active subscription", async () => {
    await subscriptions.save(
      OrganizationSubscription.create({ id: "sub-1", organizationId: ORG_A, planTier: PlanTier.Business, billingInterval: BillingInterval.Monthly, source: PlanSource.Stripe, occurredAt: FIXED_NOW }),
    );
    const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
    await passes.create(pass);

    const result = await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW });

    expect(result).toEqual({ outcome: "SUBSCRIPTION_COVERED" });
    expect((await passes.findById(ORG_A, "pass-1"))?.status).toBe("AVAILABLE");
    expect(auditLog.entries).toHaveLength(0);
  });

  it("returns ALREADY_ASSIGNED and never re-reserves when a Pass is already RESERVED for this tender", async () => {
    const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
    pass.reserveForTender(TENDER_A, FIXED_NOW);
    await passes.create(pass);

    const result = await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW });

    expect(result).toEqual({ outcome: "ALREADY_ASSIGNED", passPurchaseId: "pass-1" });
    expect(auditLog.entries).toHaveLength(0);
  });

  it("returns ALREADY_ASSIGNED for a Pass already CONSUMED for this tender", async () => {
    const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
    pass.consumeForTender(TENDER_A, FIXED_NOW);
    await passes.create(pass);

    const result = await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW });

    expect(result).toEqual({ outcome: "ALREADY_ASSIGNED", passPurchaseId: "pass-1" });
  });

  it("returns NEWLY_RESERVED and reserves an AVAILABLE Pass, with audit + outbox trail", async () => {
    const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
    await passes.create(pass);

    const result = await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW });

    expect(result).toEqual({ outcome: "NEWLY_RESERVED", passPurchaseId: "pass-1" });
    expect((await passes.findById(ORG_A, "pass-1"))?.status).toBe("RESERVED");
    expect((await passes.findById(ORG_A, "pass-1"))?.reservedTenderId).toBe(TENDER_A);
    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]?.action).toBe("PassReservedForTender");
    expect(outbox.events.map((e) => e.eventType)).toEqual(["PassReservedForTender"]);
  });

  it("returns DENIED when there is no subscription, no assigned Pass, and no available Pass — never an exception", async () => {
    const result = await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW });

    expect(result).toEqual({ outcome: "DENIED" });
  });

  it("mission '1 Pass = 1 Tender' — once reserved for Tender A, a fresh call for Tender B is DENIED (the Pass is no longer AVAILABLE)", async () => {
    const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
    await passes.create(pass);
    await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW });

    const result = await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_B, actorId: "user-1", occurredAt: FIXED_NOW });

    expect(result).toEqual({ outcome: "DENIED" });
  });
});
