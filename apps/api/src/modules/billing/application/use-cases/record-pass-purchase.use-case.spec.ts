import { beforeEach, describe, expect, it } from "vitest";
import { FIXED_NOW, InMemoryAuditLogWriter, InMemoryPassPurchaseRepository } from "../../test-support/fakes";
import { RecordPassPurchaseUseCase } from "./record-pass-purchase.use-case";

const ORG_A = "org-a";

describe("RecordPassPurchaseUseCase", () => {
  let passes: InMemoryPassPurchaseRepository;
  let auditLog: InMemoryAuditLogWriter;
  let useCase: RecordPassPurchaseUseCase;

  beforeEach(() => {
    passes = new InMemoryPassPurchaseRepository();
    auditLog = new InMemoryAuditLogWriter();
    useCase = new RecordPassPurchaseUseCase(passes, auditLog);
  });

  it("creates exactly one Pass purchase at 9900 cents (99€) and audits PassPurchased", async () => {
    const purchase = await useCase.execute({ organizationId: ORG_A, externalReference: "cs_test_1", actorId: "user-1", occurredAt: FIXED_NOW });

    expect(purchase.toProps().priceCents).toBe(9900);
    const page = await passes.list(ORG_A, { limit: 10 });
    expect(page.items).toHaveLength(1);
    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]?.action).toBe("PassPurchased");
  });

  it("mission §41 — a duplicate webhook delivery (same externalReference) never creates a second Pass", async () => {
    const first = await useCase.execute({ organizationId: ORG_A, externalReference: "cs_test_dup", actorId: "user-1", occurredAt: FIXED_NOW });
    const second = await useCase.execute({ organizationId: ORG_A, externalReference: "cs_test_dup", actorId: "user-1", occurredAt: FIXED_NOW });

    expect(second.id).toBe(first.id);
    const page = await passes.list(ORG_A, { limit: 10 });
    expect(page.items).toHaveLength(1);
    // Idempotent replay never re-audits (mission — pas de spam, même motif que le pattern
    // consommateur idempotent Outbox, Sprint 21).
    expect(auditLog.entries).toHaveLength(1);
  });

  it("mission §36 — supports multiple distinct Pass purchases by the same organization, each traceable", async () => {
    await useCase.execute({ organizationId: ORG_A, externalReference: "cs_test_a", actorId: "user-1", occurredAt: FIXED_NOW });
    await useCase.execute({ organizationId: ORG_A, externalReference: "cs_test_b", actorId: "user-1", occurredAt: FIXED_NOW });

    const page = await passes.list(ORG_A, { limit: 10 });
    expect(page.items).toHaveLength(2);
  });

  it("leaves expiresAt unset while no commercial duration policy has been decided (mission §10)", async () => {
    const purchase = await useCase.execute({ organizationId: ORG_A, externalReference: "cs_test_no_expiry", actorId: "user-1", occurredAt: FIXED_NOW });
    expect(purchase.expiresAt).toBeUndefined();
  });
});
