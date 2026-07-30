import { beforeEach, describe, expect, it } from "vitest";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import { ChecklistItem } from "../../domain/checklist-item.entity";
import { ChecklistItemNotFoundError, TenderNotFoundError, TenderPermissionMissingError } from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import {
  createClientPortfolioTestFixture,
  DEFAULT_TEST_CLIENT_ACCOUNT_ID,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryChecklistItemRepository,
  InMemoryTenderRepository,
} from "../../test-support/fakes";
import { ChangeChecklistItemStatusUseCase, UpdateChecklistItemUseCase } from "./update-checklist-item.use-case";

describe("UpdateChecklistItemUseCase / ChangeChecklistItemStatusUseCase", () => {
  let checklistRepository: InMemoryChecklistItemRepository;
  let tenderRepository: InMemoryTenderRepository;
  let clientPortfolio: Awaited<ReturnType<typeof createClientPortfolioTestFixture>>;
  let updateUseCase: UpdateChecklistItemUseCase;
  let changeStatusUseCase: ChangeChecklistItemStatusUseCase;

  beforeEach(async () => {
    checklistRepository = new InMemoryChecklistItemRepository();
    tenderRepository = new InMemoryTenderRepository();
    clientPortfolio = await createClientPortfolioTestFixture("org-1");
    updateUseCase = new UpdateChecklistItemUseCase(
      checklistRepository,
      new FixedClock(),
      tenderRepository,
      clientPortfolio.assertClientAccessUseCase,
    );
    changeStatusUseCase = new ChangeChecklistItemStatusUseCase(
      checklistRepository,
      new InMemoryAuditLogWriter(),
      new FixedClock(),
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
    await checklistRepository.save(
      ChecklistItem.create({
        id: "item-1",
        organizationId: "org-1",
        tenderId: "tender-1",
        title: "Fournir attestation fiscale",
        occurredAt: new Date(),
      }),
    );
  });

  describe("update", () => {
    it("updates the editable fields", async () => {
      const result = await updateUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        itemId: "item-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        title: "Titre revise",
      });

      expect(result.title).toBe("Titre revise");
    });

    it("throws TenderNotFoundError when the tender does not belong to the caller's organization", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-2",
          tenderId: "tender-1",
          itemId: "item-1",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          title: "x",
        }),
      ).rejects.toThrow(TenderNotFoundError);
    });

    it("throws ChecklistItemNotFoundError for an unknown item id", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          itemId: "unknown",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          title: "x",
        }),
      ).rejects.toThrow(ChecklistItemNotFoundError);
    });

    it("refuses when the actor lacks tender:manage_checklist", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          itemId: "item-1",
          actorId: "user-1",
          actorRole: "READ_ONLY",
          title: "x",
        }),
      ).rejects.toThrow(TenderPermissionMissingError);
    });

    it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:manage_checklist", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          itemId: "item-1",
          actorId: "user-unaffiliated",
          actorRole: "BID_MANAGER",
          title: "x",
        }),
      ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
    });
  });

  describe("changeStatus", () => {
    it("changes the item status and records an audit entry", async () => {
      const result = await changeStatusUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        itemId: "item-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        status: "COMPLETED",
      });

      expect(result.status).toBe("COMPLETED");
    });

    it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:manage_checklist", async () => {
      await expect(
        changeStatusUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          itemId: "item-1",
          actorId: "user-unaffiliated",
          actorRole: "BID_MANAGER",
          status: "COMPLETED",
        }),
      ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
    });
  });
});
