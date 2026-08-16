import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryAoCreditLedgerRepository, InMemoryAuditLogWriter } from "../../test-support/fakes";
import { GrantTrialAoCreditUseCase } from "./grant-trial-ao-credit.use-case";

const OCCURRED_AT = new Date("2026-08-15T09:00:00Z");

describe("GrantTrialAoCreditUseCase", () => {
  let ledger: InMemoryAoCreditLedgerRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let useCase: GrantTrialAoCreditUseCase;

  beforeEach(() => {
    ledger = new InMemoryAoCreditLedgerRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    useCase = new GrantTrialAoCreditUseCase(ledger, auditLogWriter);
  });

  it("mission §16 — grants exactly 1 AO credit", async () => {
    const entry = await useCase.execute({ organizationId: "org-1", actorId: "stripe-webhook", occurredAt: OCCURRED_AT });

    expect(entry.amount).toBe(1);
    expect(entry.balanceAfter).toBe(1);
    expect(await ledger.getBalance("org-1")).toBe(1);
    expect(auditLogWriter.entries).toHaveLength(1);
    expect(auditLogWriter.entries[0]?.action).toBe("AoTrialCreditGranted");
  });

  it("mission §18 — the same Trial activated twice (webhook retry) grants exactly 1 credit, never a second AuditLog entry", async () => {
    await useCase.execute({ organizationId: "org-1", actorId: "stripe-webhook", occurredAt: OCCURRED_AT });
    const second = await useCase.execute({ organizationId: "org-1", actorId: "stripe-webhook", occurredAt: OCCURRED_AT });

    expect(await ledger.getBalance("org-1")).toBe(1);
    expect(second.amount).toBe(1);
    expect(auditLogWriter.entries).toHaveLength(1);
  });

  it("is scoped per organization — a second organization gets its own 1 credit", async () => {
    await useCase.execute({ organizationId: "org-1", actorId: "stripe-webhook", occurredAt: OCCURRED_AT });
    await useCase.execute({ organizationId: "org-2", actorId: "stripe-webhook", occurredAt: OCCURRED_AT });

    expect(await ledger.getBalance("org-1")).toBe(1);
    expect(await ledger.getBalance("org-2")).toBe(1);
  });
});
