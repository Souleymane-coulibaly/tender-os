import { beforeEach, describe, expect, it } from "vitest";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import {
  DuplicateTenderLotNumberError,
  TenderArchivedError,
  TenderLotNotDeletedError,
  TenderLotNotFoundError,
  TenderNotFoundError,
} from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { TenderLot } from "../../domain/tender-lot.entity";
import { Tender } from "../../domain/tender.aggregate";
import { TenderStatus } from "../../domain/tender-status";
import {
  createClientPortfolioTestFixture,
  FakeOutboxWriter,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryTenderLotRepository,
  InMemoryTenderRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import { CreateTenderLotUseCase } from "./create-tender-lot.use-case";
import { RestoreTenderLotUseCase } from "./restore-tender-lot.use-case";
import { DeleteTenderLotUseCase } from "./update-tender-lot.use-case";

describe("RestoreTenderLotUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let lotRepository: InMemoryTenderLotRepository;
  let restoreAuditLogWriter: InMemoryAuditLogWriter;
  let clientPortfolio: Awaited<ReturnType<typeof createClientPortfolioTestFixture>>;
  let restoreUseCase: RestoreTenderLotUseCase;
  let deleteUseCase: DeleteTenderLotUseCase;
  let createUseCase: CreateTenderLotUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    lotRepository = new InMemoryTenderLotRepository();
    restoreAuditLogWriter = new InMemoryAuditLogWriter();
    clientPortfolio = await createClientPortfolioTestFixture("org-1");
    restoreUseCase = new RestoreTenderLotUseCase(
      tenderRepository,
      lotRepository,
      restoreAuditLogWriter,
      new FixedClock(),
      clientPortfolio.assertClientAccessUseCase,
    );
    deleteUseCase = new DeleteTenderLotUseCase(
      tenderRepository,
      lotRepository,
      new InMemoryAuditLogWriter(),
      new FixedClock(),
      clientPortfolio.assertClientAccessUseCase,
    );
    createUseCase = new CreateTenderLotUseCase(
      tenderRepository,
      lotRepository,
      new InMemoryAuditLogWriter(),
      new FixedClock(),
      new SequentialIdGenerator(),
      new FakeOutboxWriter(),
      clientPortfolio.assertClientAccessUseCase,
    );

    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-1"),
        organizationId: "org-1",
        clientAccountId: "client-1",
        title: "Marche de travaux",
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

  it("restores a deleted lot, repositions it at the end, and records an audit entry (AUDIT-006)", async () => {
    await deleteUseCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      lotId: "lot-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
    });
    await createUseCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      lotNumber: "02",
      title: "Lot equipements",
    });

    const restored = await restoreUseCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      lotId: "lot-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      requestId: "request-1",
    });

    expect(restored.displayOrder).toBe(1);
    const found = await lotRepository.findById({ organizationId: "org-1", tenderId: "tender-1", lotId: "lot-1" });
    expect(found).not.toBeNull();

    expect(restoreAuditLogWriter.entries).toHaveLength(1);
    expect(restoreAuditLogWriter.entries[0]).toMatchObject({
      organizationId: "org-1",
      actorId: "user-1",
      action: "tender_lot.restored",
      resourceType: "tender_lot",
      resourceId: "lot-1",
      requestId: "request-1",
    });
  });

  it("keeps the lot number reserved while deleted, then safe to restore without collision", async () => {
    await deleteUseCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      lotId: "lot-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
    });

    await expect(
      createUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        lotNumber: "01",
        title: "Nouveau lot avec le meme numero",
      }),
    ).rejects.toThrow(DuplicateTenderLotNumberError);

    const restored = await restoreUseCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      lotId: "lot-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
    });
    expect(restored.lotNumber).toBe("01");
  });

  it("throws TenderLotNotDeletedError when restoring a lot that is still active", async () => {
    await expect(
      restoreUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        lotId: "lot-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
      }),
    ).rejects.toThrow(TenderLotNotDeletedError);
  });

  it("throws TenderLotNotFoundError for an unknown lot id", async () => {
    await expect(
      restoreUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        lotId: "unknown",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
      }),
    ).rejects.toThrow(TenderLotNotFoundError);
  });

  it("throws TenderNotFoundError when the tender does not belong to the caller's organization", async () => {
    await expect(
      restoreUseCase.execute({
        organizationId: "org-2",
        tenderId: "tender-1",
        lotId: "lot-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
      }),
    ).rejects.toThrow(TenderNotFoundError);
  });

  it("throws TenderArchivedError when the tender is archived (AUDIT-001)", async () => {
    await deleteUseCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      lotId: "lot-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
    });
    const tender = await tenderRepository.findById({ organizationId: "org-1", tenderId: "tender-1" });
    tender!.changeStatus(TenderStatus.Archived, new Date());
    await tenderRepository.save(tender!);

    await expect(
      restoreUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        lotId: "lot-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
      }),
    ).rejects.toThrow(TenderArchivedError);
    expect(restoreAuditLogWriter.entries).toHaveLength(0);
  });

  it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:update", async () => {
    await expect(
      restoreUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        lotId: "lot-1",
        actorId: "user-unaffiliated",
        actorRole: "BID_MANAGER",
      }),
    ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
  });
});
