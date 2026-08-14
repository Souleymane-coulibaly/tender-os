import { beforeEach, describe, expect, it } from "vitest";
import { PlatformCapabilityMissingError } from "../../../platform-administration/domain/errors";
import { PlatformRole } from "../../../platform-administration/domain/platform-role";
import { AoCreditAdjustmentReasonRequiredError, AoCreditAdjustmentWouldGoNegativeError } from "../../domain/errors";
import { FIXED_NOW, InMemoryAoCreditLedgerRepository, InMemoryAuditLogWriter } from "../../test-support/fakes";
import { AdjustAoCreditsUseCase } from "./adjust-ao-credits.use-case";

const ORG_A = "org-a";

describe("AdjustAoCreditsUseCase", () => {
  let ledger: InMemoryAoCreditLedgerRepository;
  let auditLog: InMemoryAuditLogWriter;
  let useCase: AdjustAoCreditsUseCase;

  beforeEach(() => {
    ledger = new InMemoryAoCreditLedgerRepository();
    auditLog = new InMemoryAuditLogWriter();
    useCase = new AdjustAoCreditsUseCase(ledger, auditLog);
  });

  it("mission §31 — a Platform Admin can grant a +1 manual adjustment with a mandatory reason, audited", async () => {
    const entry = await useCase.execute({ organizationId: ORG_A, amount: 1, reason: "Geste commercial", actorPlatformAdministratorId: "admin-1", actorPlatformRole: PlatformRole.Owner, occurredAt: FIXED_NOW });

    expect(entry.balanceAfter).toBe(1);
    expect(await ledger.getBalance(ORG_A)).toBe(1);
    expect(auditLog.entries.some((e) => e.action === "AoCreditsAdjusted")).toBe(true);
  });

  it("mission §48 — PLATFORM_SUPPORT (read-only) cannot adjust credits", async () => {
    await expect(
      useCase.execute({ organizationId: ORG_A, amount: 1, reason: "Test", actorPlatformAdministratorId: "admin-1", actorPlatformRole: PlatformRole.Support, occurredAt: FIXED_NOW }),
    ).rejects.toBeInstanceOf(PlatformCapabilityMissingError);
  });

  it("requires a non-empty reason", async () => {
    await expect(
      useCase.execute({ organizationId: ORG_A, amount: 1, reason: "   ", actorPlatformAdministratorId: "admin-1", actorPlatformRole: PlatformRole.Owner, occurredAt: FIXED_NOW }),
    ).rejects.toBeInstanceOf(AoCreditAdjustmentReasonRequiredError);
  });

  it("correctif audit Codex 22B (P1-02) — refuses (never silently clamps) an adjustment that would take the balance negative: balance 3, adjust -5 => rejected, balance unchanged, no entry, no audit", async () => {
    await ledger.grant({ organizationId: ORG_A, period: "2026-08", nominalAmount: 3, rolloverCap: 6, occurredAt: FIXED_NOW });

    await expect(
      useCase.execute({ organizationId: ORG_A, amount: -5, reason: "Correction", actorPlatformAdministratorId: "admin-1", actorPlatformRole: PlatformRole.Owner, occurredAt: FIXED_NOW }),
    ).rejects.toBeInstanceOf(AoCreditAdjustmentWouldGoNegativeError);

    expect(await ledger.getBalance(ORG_A)).toBe(3);
    const page = await ledger.list(ORG_A, { limit: 10 });
    expect(page.items.filter((e) => e.type === "MANUAL_ADJUSTMENT")).toHaveLength(0);
    expect(auditLog.entries.some((e) => e.action === "AoCreditsAdjusted")).toBe(false);
  });

  it("an adjustment that lands exactly on 0 is accepted (only strictly negative is refused)", async () => {
    await ledger.grant({ organizationId: ORG_A, period: "2026-08", nominalAmount: 3, rolloverCap: 6, occurredAt: FIXED_NOW });

    const entry = await useCase.execute({ organizationId: ORG_A, amount: -3, reason: "Correction exacte", actorPlatformAdministratorId: "admin-1", actorPlatformRole: PlatformRole.Owner, occurredAt: FIXED_NOW });

    expect(entry.balanceAfter).toBe(0);
    expect(await ledger.getBalance(ORG_A)).toBe(0);
  });
});
