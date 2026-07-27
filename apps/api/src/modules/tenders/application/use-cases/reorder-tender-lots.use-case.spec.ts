import { beforeEach, describe, expect, it } from "vitest";
import { InvalidLotReorderPayloadError, TenderArchivedError, TenderNotFoundError } from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { TenderLot } from "../../domain/tender-lot.entity";
import { Tender } from "../../domain/tender.aggregate";
import { TenderStatus } from "../../domain/tender-status";
import {
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryTenderLotRepository,
  InMemoryTenderRepository,
} from "../../test-support/fakes";
import { DeleteTenderLotUseCase } from "./update-tender-lot.use-case";
import { ReorderTenderLotsUseCase } from "./reorder-tender-lots.use-case";

describe("ReorderTenderLotsUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let lotRepository: InMemoryTenderLotRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let useCase: ReorderTenderLotsUseCase;
  let deleteUseCase: DeleteTenderLotUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    lotRepository = new InMemoryTenderLotRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    useCase = new ReorderTenderLotsUseCase(tenderRepository, lotRepository, auditLogWriter, new FixedClock());
    deleteUseCase = new DeleteTenderLotUseCase(tenderRepository, lotRepository, new InMemoryAuditLogWriter(), new FixedClock());

    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-1"),
        organizationId: "org-1",
        title: "Marche de travaux",
        createdBy: "user-1",
        occurredAt: new Date(),
      }),
    );
    for (const [id, lotNumber, displayOrder] of [
      ["lot-1", "01", 0],
      ["lot-2", "02", 1],
      ["lot-3", "03", 2],
    ] as const) {
      await lotRepository.seed(
        TenderLot.create({
          id,
          organizationId: "org-1",
          tenderId: "tender-1",
          lotNumber,
          title: `Lot ${lotNumber}`,
          displayOrder,
          occurredAt: new Date(),
        }),
      );
    }
  });

  it("reassigns a dense displayOrder sequence matching the given order and records an audit entry (AUDIT-006)", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      orderedLotIds: ["lot-3", "lot-1", "lot-2"],
      requestId: "request-1",
    });

    expect(result.map((lot) => ({ id: lot.id, displayOrder: lot.displayOrder }))).toEqual([
      { id: "lot-3", displayOrder: 0 },
      { id: "lot-1", displayOrder: 1 },
      { id: "lot-2", displayOrder: 2 },
    ]);

    expect(auditLogWriter.entries).toHaveLength(1);
    expect(auditLogWriter.entries[0]).toMatchObject({
      organizationId: "org-1",
      actorId: "user-1",
      action: "tender_lot.reordered",
      resourceType: "tender_lot",
      resourceId: "tender-1",
      requestId: "request-1",
    });
  });

  it("rejects a payload with a different cardinality than the active lots", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        orderedLotIds: ["lot-1", "lot-2"],
      }),
    ).rejects.toThrow(InvalidLotReorderPayloadError);
  });

  it("rejects a payload with a duplicate lot id", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        orderedLotIds: ["lot-1", "lot-1", "lot-2"],
      }),
    ).rejects.toThrow(InvalidLotReorderPayloadError);
  });

  it("rejects a payload containing a deleted lot id", async () => {
    await deleteUseCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      lotId: "lot-3",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
    });

    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        orderedLotIds: ["lot-1", "lot-2", "lot-3"],
      }),
    ).rejects.toThrow(InvalidLotReorderPayloadError);
  });

  it("rejects a payload containing an id foreign to this tender", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        orderedLotIds: ["lot-1", "lot-2", "foreign-lot"],
      }),
    ).rejects.toThrow(InvalidLotReorderPayloadError);
  });

  it("throws TenderNotFoundError when the tender does not belong to the caller's organization", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-2",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        orderedLotIds: ["lot-1", "lot-2", "lot-3"],
      }),
    ).rejects.toThrow(TenderNotFoundError);
  });

  it("throws TenderArchivedError when the tender is archived (AUDIT-001)", async () => {
    const tender = await tenderRepository.findById({ organizationId: "org-1", tenderId: "tender-1" });
    tender!.changeStatus(TenderStatus.Archived, new Date());
    await tenderRepository.save(tender!);

    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        orderedLotIds: ["lot-1", "lot-2", "lot-3"],
      }),
    ).rejects.toThrow(TenderArchivedError);
    expect(auditLogWriter.entries).toHaveLength(0);
  });
});
