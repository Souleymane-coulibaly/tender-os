import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetTenderUseCase } from "../../../tenders";
import { DcePermissionMissingError, TenderArchivedForDceMutationError } from "../../domain/errors";
import { DceStatus } from "../../domain/dce-status";
import { FixedClock, InMemoryAuditLogWriter, InMemoryDceRepository, SequentialIdGenerator } from "../../test-support/fakes";
import { CreateDceUseCase } from "./create-dce.use-case";

function fakeGetTenderUseCase(overrides: Record<string, unknown> = {}): GetTenderUseCase {
  return {
    execute: vi.fn(async () => ({ id: "tender-1", organizationId: "org-1", ...overrides })),
  } as unknown as GetTenderUseCase;
}

describe("CreateDceUseCase", () => {
  let dceRepository: InMemoryDceRepository;
  let auditLogWriter: InMemoryAuditLogWriter;

  beforeEach(() => {
    dceRepository = new InMemoryDceRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
  });

  function fakeEntitlementService(allowed = true) {
    return {
      canOperateOnTender: vi.fn(async () => allowed),
      runTenderOperationEntitled: vi.fn(async (_input: unknown, operation: () => Promise<unknown>) => {
        if (!allowed) {
          throw Object.assign(new Error("not entitled"), { code: "TENDER_OPERATION_NOT_ENTITLED" });
        }
        return operation();
      }),
    };
  }

  function buildUseCase(getTenderUseCase: GetTenderUseCase = fakeGetTenderUseCase(), entitlementService?: ReturnType<typeof fakeEntitlementService>) {
    return new CreateDceUseCase(dceRepository, auditLogWriter, new FixedClock(), new SequentialIdGenerator(), getTenderUseCase, (entitlementService ?? fakeEntitlementService()) as never);
  }

  it("creates a DRAFT DCE for a tender that has none yet, and records an audit entry", async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
    });

    expect(result.status).toBe(DceStatus.Draft);
    expect(result.tenderId).toBe("tender-1");
    expect(auditLogWriter.entries).toHaveLength(1);
    expect(auditLogWriter.entries[0]?.action).toBe("dce.created");
  });

  it("is idempotent: calling it again for the same tender returns the existing DCE without creating a duplicate", async () => {
    const useCase = buildUseCase();

    const first = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
    });
    const second = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
    });

    expect(second.id).toBe(first.id);
    expect(auditLogWriter.entries).toHaveLength(1);
  });

  it("Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 1, mission TEST 1 — refuses (never creates a DCE) when the organization has no entitlement (no subscription, no Pass) to operate on this tender", async () => {
    const entitlementService = fakeEntitlementService(false);
    const useCase = buildUseCase(fakeGetTenderUseCase(), entitlementService);

    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "BID_MANAGER" }),
    ).rejects.toMatchObject({ code: "TENDER_OPERATION_NOT_ENTITLED" });

    expect(entitlementService.runTenderOperationEntitled).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", tenderId: "tender-1" }), expect.any(Function));
    expect(auditLogWriter.entries).toHaveLength(0);
  });

  it("refuses when the actor lacks dce:create", async () => {
    const useCase = buildUseCase();

    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "READ_ONLY" }),
    ).rejects.toThrow(DcePermissionMissingError);

    expect(auditLogWriter.entries).toHaveLength(0);
  });

  it("refuses to create a DCE for an archived tender", async () => {
    const useCase = buildUseCase(fakeGetTenderUseCase({ archivedAt: "2026-07-27T00:00:00.000Z" }));

    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorId: "user-1", actorRole: "BID_MANAGER" }),
    ).rejects.toThrow(TenderArchivedForDceMutationError);
  });
});
