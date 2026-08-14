import { beforeEach, describe, expect, it } from "vitest";
import { PlatformCapabilityMissingError } from "../../../platform-administration/domain/errors";
import { PlatformRole } from "../../../platform-administration/domain/platform-role";
import { AoCreditConsumptionAlreadyReversedError, AoCreditLedgerEntryNotFoundError } from "../../domain/errors";
import { FIXED_NOW, InMemoryAoCreditLedgerRepository, InMemoryAuditLogWriter } from "../../test-support/fakes";
import { ReverseAoCreditConsumptionUseCase } from "./reverse-ao-credit-consumption.use-case";

const ORG_A = "org-a";
const TENDER_1 = "tender-1";

describe("ReverseAoCreditConsumptionUseCase", () => {
  let ledger: InMemoryAoCreditLedgerRepository;
  let auditLog: InMemoryAuditLogWriter;
  let useCase: ReverseAoCreditConsumptionUseCase;

  beforeEach(async () => {
    ledger = new InMemoryAoCreditLedgerRepository();
    auditLog = new InMemoryAuditLogWriter();
    useCase = new ReverseAoCreditConsumptionUseCase(ledger, auditLog);

    await ledger.grant({ organizationId: ORG_A, period: "2026-08", nominalAmount: 2, rolloverCap: 6, occurredAt: FIXED_NOW });
    await ledger.consume({ organizationId: ORG_A, tenderId: TENDER_1, amount: 1, occurredAt: FIXED_NOW });
  });

  it("mission §7 (symétrie Pass) — a Platform Admin can reverse a consumption, crediting the balance back", async () => {
    expect(await ledger.getBalance(ORG_A)).toBe(1);

    const entry = await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, reason: "Doublon créé par erreur", actorPlatformAdministratorId: "admin-1", actorPlatformRole: PlatformRole.Owner, occurredAt: FIXED_NOW });

    expect(entry.amount).toBe(1);
    expect(await ledger.getBalance(ORG_A)).toBe(2);
  });

  it("PLATFORM_SUPPORT (read-only) cannot reverse a consumption", async () => {
    await expect(
      useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, reason: "Test", actorPlatformAdministratorId: "admin-1", actorPlatformRole: PlatformRole.Support, occurredAt: FIXED_NOW }),
    ).rejects.toBeInstanceOf(PlatformCapabilityMissingError);
  });

  it("refuses to reverse a consumption that does not exist", async () => {
    await expect(
      useCase.execute({ organizationId: ORG_A, tenderId: "tender-unknown", reason: "Test", actorPlatformAdministratorId: "admin-1", actorPlatformRole: PlatformRole.Owner, occurredAt: FIXED_NOW }),
    ).rejects.toBeInstanceOf(AoCreditLedgerEntryNotFoundError);
  });

  it("never reverses the same consumption twice (no double credit)", async () => {
    await useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, reason: "First", actorPlatformAdministratorId: "admin-1", actorPlatformRole: PlatformRole.Owner, occurredAt: FIXED_NOW });

    await expect(
      useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, reason: "Second attempt", actorPlatformAdministratorId: "admin-1", actorPlatformRole: PlatformRole.Owner, occurredAt: FIXED_NOW }),
    ).rejects.toBeInstanceOf(AoCreditConsumptionAlreadyReversedError);
  });

  it("correctif audit Codex 22B (P1-01) — two truly simultaneous reversal attempts on the SAME tenderId: exactly one succeeds, balance credited only once", async () => {
    const results = await Promise.allSettled([
      useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, reason: "Attempt A", actorPlatformAdministratorId: "admin-1", actorPlatformRole: PlatformRole.Owner, occurredAt: FIXED_NOW }),
      useCase.execute({ organizationId: ORG_A, tenderId: TENDER_1, reason: "Attempt B", actorPlatformAdministratorId: "admin-2", actorPlatformRole: PlatformRole.Owner, occurredAt: FIXED_NOW }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(AoCreditConsumptionAlreadyReversedError);

    expect(await ledger.getBalance(ORG_A)).toBe(2);
    const page = await ledger.list(ORG_A, { limit: 10 });
    expect(page.items.filter((e) => e.type === "REVERSAL")).toHaveLength(1);
  });
});
