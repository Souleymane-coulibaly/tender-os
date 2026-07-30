import { beforeEach, describe, expect, it } from "vitest";
import { TenderNotFoundError } from "../../domain/errors";
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
import { ListTenderLotsUseCase } from "./list-tender-lots.use-case";

describe("ListTenderLotsUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let lotRepository: InMemoryTenderLotRepository;
  let useCase: ListTenderLotsUseCase;
  let deleteUseCase: DeleteTenderLotUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    lotRepository = new InMemoryTenderLotRepository();
    const clientPortfolio = await createClientPortfolioTestFixture("org-1");
    useCase = new ListTenderLotsUseCase(tenderRepository, lotRepository);
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
        id: "lot-2",
        organizationId: "org-1",
        tenderId: "tender-1",
        lotNumber: "02",
        title: "Lot equipements",
        displayOrder: 1,
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
    await lotRepository.seed(
      TenderLot.create({
        id: "lot-3",
        organizationId: "org-1",
        tenderId: "tender-1",
        lotNumber: "03",
        title: "Lot supprime",
        displayOrder: 2,
        occurredAt: new Date(),
      }),
    );
  });

  it("returns active lots sorted by displayOrder, excluding deleted ones", async () => {
    await deleteUseCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      lotId: "lot-3",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
    });

    const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorRole: "READ_ONLY" });

    expect(result.map((lot) => lot.lotNumber)).toEqual(["01", "02"]);
  });

  it("throws TenderNotFoundError when the tender does not belong to the caller's organization", async () => {
    await expect(
      useCase.execute({ organizationId: "org-2", tenderId: "tender-1", actorRole: "READ_ONLY" }),
    ).rejects.toThrow(TenderNotFoundError);
  });
});
