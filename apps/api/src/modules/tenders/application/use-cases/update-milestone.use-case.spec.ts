import { beforeEach, describe, expect, it } from "vitest";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import { Milestone } from "../../domain/milestone.entity";
import {
  MilestoneNotFoundError,
  TenderLotMismatchError,
  TenderNotFoundError,
  TenderPermissionMissingError,
} from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { TenderLot } from "../../domain/tender-lot.entity";
import { Tender } from "../../domain/tender.aggregate";
import {
  createClientPortfolioTestFixture,
  DEFAULT_TEST_CLIENT_ACCOUNT_ID,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryMilestoneRepository,
  InMemoryTenderLotRepository,
  InMemoryTenderRepository,
} from "../../test-support/fakes";
import { DeleteMilestoneUseCase, MarkMilestoneDoneUseCase, UpdateMilestoneUseCase } from "./update-milestone.use-case";

describe("UpdateMilestoneUseCase / MarkMilestoneDoneUseCase / DeleteMilestoneUseCase", () => {
  let milestoneRepository: InMemoryMilestoneRepository;
  let tenderRepository: InMemoryTenderRepository;
  let lotRepository: InMemoryTenderLotRepository;
  let clientPortfolio: Awaited<ReturnType<typeof createClientPortfolioTestFixture>>;
  let updateUseCase: UpdateMilestoneUseCase;
  let markDoneUseCase: MarkMilestoneDoneUseCase;
  let deleteUseCase: DeleteMilestoneUseCase;
  let deleteAuditLogWriter: InMemoryAuditLogWriter;

  beforeEach(async () => {
    milestoneRepository = new InMemoryMilestoneRepository();
    tenderRepository = new InMemoryTenderRepository();
    lotRepository = new InMemoryTenderLotRepository();
    clientPortfolio = await createClientPortfolioTestFixture("org-1");
    updateUseCase = new UpdateMilestoneUseCase(
      milestoneRepository,
      new InMemoryAuditLogWriter(),
      new FixedClock(),
      tenderRepository,
      lotRepository,
      clientPortfolio.assertClientAccessUseCase,
    );
    markDoneUseCase = new MarkMilestoneDoneUseCase(
      milestoneRepository,
      new FixedClock(),
      tenderRepository,
      clientPortfolio.assertClientAccessUseCase,
    );
    deleteAuditLogWriter = new InMemoryAuditLogWriter();
    deleteUseCase = new DeleteMilestoneUseCase(
      milestoneRepository,
      deleteAuditLogWriter,
      tenderRepository,
      clientPortfolio.assertClientAccessUseCase,
    );

    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-1"),
        organizationId: "org-1",
        clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
        title: "Marche de travaux",
        createdBy: "user-1",
        occurredAt: new Date(),
      }),
    );
    await milestoneRepository.save(
      Milestone.create({
        id: "milestone-1",
        organizationId: "org-1",
        tenderId: "tender-1",
        title: "Date limite de remise",
        date: new Date("2026-09-01T00:00:00Z"),
        type: "SUBMISSION_DEADLINE",
        occurredAt: new Date(),
      }),
    );
  });

  describe("update", () => {
    it("updates the editable fields", async () => {
      const result = await updateUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        milestoneId: "milestone-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        title: "Date revisee",
      });

      expect(result.title).toBe("Date revisee");
    });

    it("throws TenderNotFoundError when the tender does not belong to the caller's organization", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-2",
          tenderId: "tender-1",
          milestoneId: "milestone-1",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          title: "x",
        }),
      ).rejects.toThrow(TenderNotFoundError);
    });

    it("throws MilestoneNotFoundError for an unknown milestone id", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          milestoneId: "unknown",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          title: "x",
        }),
      ).rejects.toThrow(MilestoneNotFoundError);
    });

    it("refuses when the actor lacks tender:update", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          milestoneId: "milestone-1",
          actorId: "user-1",
          actorRole: "READ_ONLY",
          title: "x",
        }),
      ).rejects.toThrow(TenderPermissionMissingError);
    });

    it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:update", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          milestoneId: "milestone-1",
          actorId: "user-unaffiliated",
          actorRole: "BID_MANAGER",
          title: "x",
        }),
      ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
    });

    it("correction audit Codex P1 — refuses a lotId that belongs to a DIFFERENT tender of the same organization (IDOR horizontal)", async () => {
      await tenderRepository.seed(
        Tender.create({
          id: TenderId.from("tender-2"),
          organizationId: "org-1",
          clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
          title: "Autre marche",
          createdBy: "user-1",
          occurredAt: new Date(),
        }),
      );
      await lotRepository.seed(
        TenderLot.create({
          id: "lot-tender-2",
          organizationId: "org-1",
          tenderId: "tender-2",
          lotNumber: "01",
          title: "Lot du tender 2",
          displayOrder: 0,
          occurredAt: new Date(),
        }),
      );

      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          milestoneId: "milestone-1",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          lotId: "lot-tender-2",
        }),
      ).rejects.toThrow(TenderLotMismatchError);
    });
  });

  describe("markDone", () => {
    it("marks the milestone done", async () => {
      const result = await markDoneUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        milestoneId: "milestone-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
      });

      expect(result.status).toBe("DONE");
    });

    it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:update", async () => {
      await expect(
        markDoneUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          milestoneId: "milestone-1",
          actorId: "user-unaffiliated",
          actorRole: "BID_MANAGER",
        }),
      ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
    });
  });

  describe("delete", () => {
    it("deletes the milestone", async () => {
      await deleteUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        milestoneId: "milestone-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
      });

      await expect(
        milestoneRepository.findById({ organizationId: "org-1", tenderId: "tender-1", milestoneId: "milestone-1" }),
      ).resolves.toBeNull();
    });

    it("Sprint 21 (hardening) — records an audit log entry, the one gap its sibling UpdateMilestoneUseCase did not have", async () => {
      await deleteUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        milestoneId: "milestone-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
      });

      expect(deleteAuditLogWriter.entries).toHaveLength(1);
      expect(deleteAuditLogWriter.entries[0]).toMatchObject({
        organizationId: "org-1",
        actorId: "user-1",
        action: "tender.milestone_deleted",
        resourceType: "tender_milestone",
        resourceId: "milestone-1",
      });
    });

    it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:update", async () => {
      await expect(
        deleteUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          milestoneId: "milestone-1",
          actorId: "user-unaffiliated",
          actorRole: "BID_MANAGER",
        }),
      ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
    });
  });
});
