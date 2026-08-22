import { beforeEach, describe, expect, it } from "vitest";
import { PassPurchase } from "../../domain/pass-purchase.aggregate";
import { FIXED_NOW, FakeOutboxWriter, InMemoryAuditLogWriter, InMemoryPassPurchaseRepository } from "../../test-support/fakes";
import { ReleasePassForTenderUseCase } from "./release-pass-for-tender.use-case";

const ORG_A = "org-a";
const TENDER_A = "tender-a";
const TENDER_B = "tender-b";

describe("ReleasePassForTenderUseCase", () => {
  let passes: InMemoryPassPurchaseRepository;
  let auditLog: InMemoryAuditLogWriter;
  let outbox: FakeOutboxWriter;
  let useCase: ReleasePassForTenderUseCase;

  beforeEach(() => {
    passes = new InMemoryPassPurchaseRepository();
    auditLog = new InMemoryAuditLogWriter();
    outbox = new FakeOutboxWriter();
    useCase = new ReleasePassForTenderUseCase(passes, auditLog, outbox);
  });

  it("releases a Pass RESERVED for this tender back to AVAILABLE, with audit + outbox trail", async () => {
    const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
    pass.reserveForTender(TENDER_A, FIXED_NOW);
    await passes.create(pass);

    const result = await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_A, passPurchaseId: "pass-1", actorId: "user-1", occurredAt: FIXED_NOW, reason: "OPERATION_FAILED" });

    expect(result).toEqual({ applied: true });
    const released = await passes.findById(ORG_A, "pass-1");
    expect(released?.status).toBe("AVAILABLE");
    expect(released?.reservedTenderId).toBeUndefined();
    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]?.action).toBe("PassReservationReleased");
    expect(outbox.events.map((e) => e.eventType)).toEqual(["PassReservationReleased"]);
  });

  it("mission §5 — a released Pass is immediately reservable again for a DIFFERENT tender", async () => {
    const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
    pass.reserveForTender(TENDER_A, FIXED_NOW);
    await passes.create(pass);
    await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_A, passPurchaseId: "pass-1", actorId: "user-1", occurredAt: FIXED_NOW, reason: "OPERATION_FAILED" });

    const { applied } = await passes.reserveForTender({ organizationId: ORG_A, tenderId: TENDER_B, now: FIXED_NOW });

    expect(applied).toBe(true);
    expect((await passes.findById(ORG_A, "pass-1"))?.reservedTenderId).toBe(TENDER_B);
  });

  it("mission §5 — releasing a Pass CONSUMED for this tender is structurally impossible (no-op, never regresses a paid consumption)", async () => {
    const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
    pass.consumeForTender(TENDER_A, FIXED_NOW);
    await passes.create(pass);

    const result = await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_A, passPurchaseId: "pass-1", actorId: "user-1", occurredAt: FIXED_NOW, reason: "OPERATION_FAILED" });

    expect(result).toEqual({ applied: false });
    const stillConsumed = await passes.findById(ORG_A, "pass-1");
    expect(stillConsumed?.status).toBe("CONSUMED");
    expect(stillConsumed?.consumedTenderId).toBe(TENDER_A);
    expect(auditLog.entries).toHaveLength(0); // aucune trace d'audit pour un no-op
  });

  it("is idempotent — releasing an already-AVAILABLE Pass (or one reserved for a DIFFERENT tenderId) is a silent no-op, never an exception", async () => {
    const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
    await passes.create(pass); // reste AVAILABLE, jamais réservé

    const result = await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_A, passPurchaseId: "pass-1", actorId: "user-1", occurredAt: FIXED_NOW, reason: "OPERATION_FAILED" });

    expect(result).toEqual({ applied: false });
    expect((await passes.findById(ORG_A, "pass-1"))?.status).toBe("AVAILABLE");
  });

  it("releasing a Pass reserved for a DIFFERENT tenderId than the one passed is a no-op (never releases someone else's reservation)", async () => {
    const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
    pass.reserveForTender(TENDER_A, FIXED_NOW);
    await passes.create(pass);

    const result = await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_B, passPurchaseId: "pass-1", actorId: "user-1", occurredAt: FIXED_NOW, reason: "OPERATION_FAILED" });

    expect(result).toEqual({ applied: false });
    expect((await passes.findById(ORG_A, "pass-1"))?.reservedTenderId).toBe(TENDER_A);
  });
});
