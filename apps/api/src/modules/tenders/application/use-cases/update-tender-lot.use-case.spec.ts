import { beforeEach, describe, expect, it } from "vitest";
import { TenderArchivedError, TenderLotNotFoundError, TenderNotFoundError, TenderPermissionMissingError } from "../../domain/errors";
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
import { DeleteTenderLotUseCase, UpdateTenderLotUseCase } from "./update-tender-lot.use-case";

describe("UpdateTenderLotUseCase / DeleteTenderLotUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let lotRepository: InMemoryTenderLotRepository;
  let updateAuditLogWriter: InMemoryAuditLogWriter;
  let deleteAuditLogWriter: InMemoryAuditLogWriter;
  let updateUseCase: UpdateTenderLotUseCase;
  let deleteUseCase: DeleteTenderLotUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    lotRepository = new InMemoryTenderLotRepository();
    updateAuditLogWriter = new InMemoryAuditLogWriter();
    deleteAuditLogWriter = new InMemoryAuditLogWriter();
    updateUseCase = new UpdateTenderLotUseCase(tenderRepository, lotRepository, updateAuditLogWriter, new FixedClock());
    deleteUseCase = new DeleteTenderLotUseCase(tenderRepository, lotRepository, deleteAuditLogWriter, new FixedClock());

    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-1"),
        organizationId: "org-1",
        title: "Marche de travaux",
        createdBy: "user-1",
        occurredAt: new Date(),
      }),
    );
    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-2"),
        organizationId: "org-1",
        title: "Autre marche, meme organisation",
        createdBy: "user-1",
        occurredAt: new Date(),
      }),
    );
    await lotRepository.seed(
      TenderLot.create({
        id: "lot-1",
        organizationId: "org-1",
        tenderId: "tender-1",
        lotNumber: "01",
        title: "Lot travaux",
        displayOrder: 0,
        occurredAt: new Date(),
      }),
    );
  });

  describe("update", () => {
    it("updates the editable fields and records an audit entry (AUDIT-006)", async () => {
      const result = await updateUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        lotId: "lot-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        title: "Lot travaux revise",
        requestId: "request-1",
      });

      expect(result.title).toBe("Lot travaux revise");
      expect(updateAuditLogWriter.entries).toHaveLength(1);
      expect(updateAuditLogWriter.entries[0]).toMatchObject({
        organizationId: "org-1",
        actorId: "user-1",
        action: "tender_lot.updated",
        resourceType: "tender_lot",
        resourceId: "lot-1",
        requestId: "request-1",
      });
    });

    it("throws TenderLotNotFoundError for a lot belonging to another tender", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-2",
          lotId: "lot-1",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          title: "x",
        }),
      ).rejects.toThrow(TenderLotNotFoundError);
    });

    it("throws TenderNotFoundError when the tender does not belong to the caller's organization", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-2",
          tenderId: "tender-1",
          lotId: "lot-1",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          title: "x",
        }),
      ).rejects.toThrow(TenderNotFoundError);
    });

    it("throws TenderLotNotFoundError when the lot was already soft-deleted", async () => {
      await deleteUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        lotId: "lot-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
      });

      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          lotId: "lot-1",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          title: "x",
        }),
      ).rejects.toThrow(TenderLotNotFoundError);
    });

    it("throws TenderArchivedError when the tender is archived (AUDIT-001)", async () => {
      const tender = await tenderRepository.findById({ organizationId: "org-1", tenderId: "tender-1" });
      tender!.changeStatus(TenderStatus.Archived, new Date());
      await tenderRepository.save(tender!);

      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          lotId: "lot-1",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          title: "x",
        }),
      ).rejects.toThrow(TenderArchivedError);
      expect(updateAuditLogWriter.entries).toHaveLength(0);
    });

    it("refuses when the actor lacks tender:update", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          lotId: "lot-1",
          actorId: "user-1",
          actorRole: "READ_ONLY",
          title: "x",
        }),
      ).rejects.toThrow(TenderPermissionMissingError);
    });
  });

  describe("delete (soft delete)", () => {
    it("marks the lot as deleted rather than removing the row, and records an audit entry", async () => {
      await deleteUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        lotId: "lot-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        requestId: "request-1",
      });

      const found = await lotRepository.findById({ organizationId: "org-1", tenderId: "tender-1", lotId: "lot-1" });
      expect(found).toBeNull();

      const foundIncludingDeleted = await lotRepository.findByIdIncludingDeleted({
        organizationId: "org-1",
        tenderId: "tender-1",
        lotId: "lot-1",
      });
      expect(foundIncludingDeleted?.deletedAt).toBeDefined();

      expect(deleteAuditLogWriter.entries).toHaveLength(1);
      expect(deleteAuditLogWriter.entries[0]).toMatchObject({
        organizationId: "org-1",
        actorId: "user-1",
        action: "tender_lot.deleted",
        resourceType: "tender_lot",
        resourceId: "lot-1",
        requestId: "request-1",
      });
    });

    it("refuses to delete an already-deleted lot (no silent idempotence)", async () => {
      await deleteUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        lotId: "lot-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
      });

      await expect(
        deleteUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          lotId: "lot-1",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
        }),
      ).rejects.toThrow(TenderLotNotFoundError);
    });

    it("throws TenderNotFoundError when the tender does not belong to the caller's organization", async () => {
      await expect(
        deleteUseCase.execute({
          organizationId: "org-2",
          tenderId: "tender-1",
          lotId: "lot-1",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
        }),
      ).rejects.toThrow(TenderNotFoundError);
    });

    it("throws TenderArchivedError when the tender is archived (AUDIT-001)", async () => {
      const tender = await tenderRepository.findById({ organizationId: "org-1", tenderId: "tender-1" });
      tender!.changeStatus(TenderStatus.Archived, new Date());
      await tenderRepository.save(tender!);

      await expect(
        deleteUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          lotId: "lot-1",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
        }),
      ).rejects.toThrow(TenderArchivedError);
      expect(deleteAuditLogWriter.entries).toHaveLength(0);
    });
  });
});
