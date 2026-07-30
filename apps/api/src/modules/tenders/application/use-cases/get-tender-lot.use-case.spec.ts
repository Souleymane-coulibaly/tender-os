import { beforeEach, describe, expect, it } from "vitest";
import { TenderLotNotFoundError, TenderNotFoundError, TenderPermissionMissingError } from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { TenderLot } from "../../domain/tender-lot.entity";
import { Tender } from "../../domain/tender.aggregate";
import {
  createClientPortfolioTestFixture,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryTenderLotRepository,
  InMemoryTenderRepository,
} from "../../test-support/fakes";
import { DeleteTenderLotUseCase } from "./update-tender-lot.use-case";
import { GetTenderLotUseCase } from "./get-tender-lot.use-case";

describe("GetTenderLotUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let lotRepository: InMemoryTenderLotRepository;
  let useCase: GetTenderLotUseCase;
  let deleteUseCase: DeleteTenderLotUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    lotRepository = new InMemoryTenderLotRepository();
    const clientPortfolio = await createClientPortfolioTestFixture("org-1");
    useCase = new GetTenderLotUseCase(tenderRepository, lotRepository);
    deleteUseCase = new DeleteTenderLotUseCase(
      tenderRepository,
      lotRepository,
      new InMemoryAuditLogWriter(),
      new FixedClock(),
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

  it("returns the lot when it exists and is active", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      lotId: "lot-1",
      actorRole: "READ_ONLY",
    });

    expect(result.lotNumber).toBe("01");
  });

  it("throws TenderLotNotFoundError for a deleted lot", async () => {
    await deleteUseCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      lotId: "lot-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
    });

    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", lotId: "lot-1", actorRole: "READ_ONLY" }),
    ).rejects.toThrow(TenderLotNotFoundError);
  });

  it("throws TenderNotFoundError when the tender does not belong to the caller's organization", async () => {
    await expect(
      useCase.execute({ organizationId: "org-2", tenderId: "tender-1", lotId: "lot-1", actorRole: "READ_ONLY" }),
    ).rejects.toThrow(TenderNotFoundError);
  });

  it("refuses when the actor lacks tender:read", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", lotId: "lot-1", actorRole: "UNKNOWN_ROLE" }),
    ).rejects.toThrow(TenderPermissionMissingError);
  });
});
