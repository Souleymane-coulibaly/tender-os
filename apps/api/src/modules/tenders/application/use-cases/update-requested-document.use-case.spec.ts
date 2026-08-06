import { beforeEach, describe, expect, it } from "vitest";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import { RequestedDocument } from "../../domain/requested-document.entity";
import {
  RequestedDocumentNotFoundError,
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
  InMemoryRequestedDocumentRepository,
  InMemoryTenderLotRepository,
  InMemoryTenderRepository,
} from "../../test-support/fakes";
import {
  ChangeRequestedDocumentStatusUseCase,
  DeleteRequestedDocumentUseCase,
  UpdateRequestedDocumentUseCase,
} from "./update-requested-document.use-case";

describe("UpdateRequestedDocumentUseCase / ChangeRequestedDocumentStatusUseCase / DeleteRequestedDocumentUseCase", () => {
  let documentRepository: InMemoryRequestedDocumentRepository;
  let tenderRepository: InMemoryTenderRepository;
  let lotRepository: InMemoryTenderLotRepository;
  let clientPortfolio: Awaited<ReturnType<typeof createClientPortfolioTestFixture>>;
  let updateUseCase: UpdateRequestedDocumentUseCase;
  let changeStatusUseCase: ChangeRequestedDocumentStatusUseCase;
  let deleteUseCase: DeleteRequestedDocumentUseCase;

  beforeEach(async () => {
    documentRepository = new InMemoryRequestedDocumentRepository();
    tenderRepository = new InMemoryTenderRepository();
    lotRepository = new InMemoryTenderLotRepository();
    clientPortfolio = await createClientPortfolioTestFixture("org-1");
    updateUseCase = new UpdateRequestedDocumentUseCase(
      documentRepository,
      new FixedClock(),
      tenderRepository,
      lotRepository,
      clientPortfolio.assertClientAccessUseCase,
    );
    changeStatusUseCase = new ChangeRequestedDocumentStatusUseCase(
      documentRepository,
      new FixedClock(),
      tenderRepository,
      clientPortfolio.assertClientAccessUseCase,
    );
    deleteUseCase = new DeleteRequestedDocumentUseCase(
      documentRepository,
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
    await documentRepository.save(
      RequestedDocument.create({
        id: "document-1",
        organizationId: "org-1",
        tenderId: "tender-1",
        name: "Attestation fiscale",
        occurredAt: new Date(),
      }),
    );
  });

  describe("update", () => {
    it("updates the editable fields", async () => {
      const result = await updateUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        documentId: "document-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        name: "Attestation revisee",
      });

      expect(result.name).toBe("Attestation revisee");
    });

    it("throws TenderNotFoundError when the tender does not belong to the caller's organization", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-2",
          tenderId: "tender-1",
          documentId: "document-1",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          name: "x",
        }),
      ).rejects.toThrow(TenderNotFoundError);
    });

    it("throws RequestedDocumentNotFoundError for an unknown document id", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          documentId: "unknown",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          name: "x",
        }),
      ).rejects.toThrow(RequestedDocumentNotFoundError);
    });

    it("refuses when the actor lacks tender:update", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          documentId: "document-1",
          actorId: "user-1",
          actorRole: "READ_ONLY",
          name: "x",
        }),
      ).rejects.toThrow(TenderPermissionMissingError);
    });

    it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:update", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          documentId: "document-1",
          actorId: "user-unaffiliated",
          actorRole: "BID_MANAGER",
          name: "x",
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
          documentId: "document-1",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          lotId: "lot-tender-2",
        }),
      ).rejects.toThrow(TenderLotMismatchError);
    });
  });

  describe("changeStatus", () => {
    it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:update", async () => {
      await expect(
        changeStatusUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          documentId: "document-1",
          actorId: "user-unaffiliated",
          actorRole: "BID_MANAGER",
          status: "PROVIDED",
        }),
      ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
    });
  });

  describe("delete", () => {
    it("deletes the document", async () => {
      await deleteUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        documentId: "document-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
      });

      await expect(
        documentRepository.findById({ organizationId: "org-1", tenderId: "tender-1", documentId: "document-1" }),
      ).resolves.toBeNull();
    });

    it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:update", async () => {
      await expect(
        deleteUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          documentId: "document-1",
          actorId: "user-unaffiliated",
          actorRole: "BID_MANAGER",
        }),
      ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
    });
  });
});
