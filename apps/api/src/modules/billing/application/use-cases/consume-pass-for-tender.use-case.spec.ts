import { beforeEach, describe, expect, it } from "vitest";
import { PassPurchaseAlreadyConsumedError } from "../../domain/errors";
import { PassPurchase } from "../../domain/pass-purchase.aggregate";
import { PassPurchaseStatus } from "../../domain/pass-purchase-status";
import { FIXED_NOW, InMemoryAuditLogWriter, InMemoryPassPurchaseRepository } from "../../test-support/fakes";
import { ConsumePassForTenderUseCase } from "./consume-pass-for-tender.use-case";

const ORG_A = "org-a";
const TENDER_A = "tender-a";
const TENDER_B = "tender-b";

describe("ConsumePassForTenderUseCase", () => {
  let passes: InMemoryPassPurchaseRepository;
  let auditLog: InMemoryAuditLogWriter;
  let useCase: ConsumePassForTenderUseCase;

  beforeEach(async () => {
    passes = new InMemoryPassPurchaseRepository();
    auditLog = new InMemoryAuditLogWriter();
    useCase = new ConsumePassForTenderUseCase(passes, auditLog);

    await passes.create(
      PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_test_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW }),
    );
  });

  it("consumes an AVAILABLE Pass for a Tender and audits PassConsumed", async () => {
    await useCase.execute({ organizationId: ORG_A, passPurchaseId: "pass-1", tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW });

    const purchase = await passes.findById(ORG_A, "pass-1");
    expect(purchase?.status).toBe(PassPurchaseStatus.Consumed);
    expect(purchase?.consumedTenderId).toBe(TENDER_A);
    expect(auditLog.entries.map((e) => e.action)).toContain("PassConsumed");
  });

  it("mission §7 — re-consuming for the SAME tender is idempotent (no error, no second audit entry)", async () => {
    await useCase.execute({ organizationId: ORG_A, passPurchaseId: "pass-1", tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW });
    await useCase.execute({ organizationId: ORG_A, passPurchaseId: "pass-1", tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW });

    expect(auditLog.entries.filter((e) => e.action === "PassConsumed")).toHaveLength(1);
  });

  it("refuses consuming an already-consumed Pass for a DIFFERENT tender", async () => {
    await useCase.execute({ organizationId: ORG_A, passPurchaseId: "pass-1", tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW });

    await expect(useCase.execute({ organizationId: ORG_A, passPurchaseId: "pass-1", tenderId: TENDER_B, actorId: "user-1", occurredAt: FIXED_NOW })).rejects.toBeInstanceOf(
      PassPurchaseAlreadyConsumedError,
    );

    const purchase = await passes.findById(ORG_A, "pass-1");
    expect(purchase?.consumedTenderId).toBe(TENDER_A);
  });

  it("BLOQUANT — two concurrent consumption attempts for two different tenders: exactly one succeeds, the Pass ends attached to exactly one tender", async () => {
    const results = await Promise.allSettled([
      useCase.execute({ organizationId: ORG_A, passPurchaseId: "pass-1", tenderId: TENDER_A, actorId: "user-1", occurredAt: FIXED_NOW }),
      useCase.execute({ organizationId: ORG_A, passPurchaseId: "pass-1", tenderId: TENDER_B, actorId: "user-2", occurredAt: FIXED_NOW }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(PassPurchaseAlreadyConsumedError);

    const purchase = await passes.findById(ORG_A, "pass-1");
    expect([TENDER_A, TENDER_B]).toContain(purchase?.consumedTenderId);
    expect(auditLog.entries.filter((e) => e.action === "PassConsumed")).toHaveLength(1);
  });
});
