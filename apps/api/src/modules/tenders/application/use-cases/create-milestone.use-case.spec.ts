import { beforeEach, describe, expect, it } from "vitest";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import { TenderLotMismatchError, TenderNotFoundError, TenderPermissionMissingError } from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { TenderLot } from "../../domain/tender-lot.entity";
import { Tender } from "../../domain/tender.aggregate";
import {
  createClientPortfolioTestFixture,
  DEFAULT_TEST_CLIENT_ACCOUNT_ID,
  FixedClock,
  InMemoryMilestoneRepository,
  InMemoryTenderLotRepository,
  InMemoryTenderRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import { CreateMilestoneUseCase } from "./create-milestone.use-case";

describe("CreateMilestoneUseCase", () => {
  let milestoneRepository: InMemoryMilestoneRepository;
  let tenderRepository: InMemoryTenderRepository;
  let lotRepository: InMemoryTenderLotRepository;
  let clientPortfolio: Awaited<ReturnType<typeof createClientPortfolioTestFixture>>;
  let useCase: CreateMilestoneUseCase;

  beforeEach(async () => {
    milestoneRepository = new InMemoryMilestoneRepository();
    tenderRepository = new InMemoryTenderRepository();
    lotRepository = new InMemoryTenderLotRepository();
    clientPortfolio = await createClientPortfolioTestFixture("org-1");
    useCase = new CreateMilestoneUseCase(
      milestoneRepository,
      new FixedClock(),
      new SequentialIdGenerator(),
      tenderRepository,
      lotRepository,
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
  });

  it("creates a milestone when the actor can update the tender", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      title: "Date limite de remise",
      date: "2026-09-01T00:00:00Z",
      type: "SUBMISSION_DEADLINE",
    });

    expect(result.title).toBe("Date limite de remise");
  });

  it("throws TenderNotFoundError when the tender does not belong to the caller's organization", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-2",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        title: "x",
        date: "2026-09-01T00:00:00Z",
        type: "SUBMISSION_DEADLINE",
      }),
    ).rejects.toThrow(TenderNotFoundError);
  });

  it("refuses when the actor lacks tender:update", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "READ_ONLY",
        title: "x",
        date: "2026-09-01T00:00:00Z",
        type: "SUBMISSION_DEADLINE",
      }),
    ).rejects.toThrow(TenderPermissionMissingError);
  });

  it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:update", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-unaffiliated",
        actorRole: "BID_MANAGER",
        title: "x",
        date: "2026-09-01T00:00:00Z",
        type: "SUBMISSION_DEADLINE",
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
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        title: "x",
        date: "2026-09-01T00:00:00Z",
        type: "SUBMISSION_DEADLINE",
        lotId: "lot-tender-2",
      }),
    ).rejects.toThrow(TenderLotMismatchError);
  });
});
