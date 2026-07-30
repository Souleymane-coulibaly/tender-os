import { beforeEach, describe, expect, it } from "vitest";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import { TenderNotFoundError, TenderPermissionMissingError } from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import {
  createClientPortfolioTestFixture,
  DEFAULT_TEST_CLIENT_ACCOUNT_ID,
  FixedClock,
  InMemoryMilestoneRepository,
  InMemoryTenderRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import { CreateMilestoneUseCase } from "./create-milestone.use-case";

describe("CreateMilestoneUseCase", () => {
  let milestoneRepository: InMemoryMilestoneRepository;
  let tenderRepository: InMemoryTenderRepository;
  let clientPortfolio: Awaited<ReturnType<typeof createClientPortfolioTestFixture>>;
  let useCase: CreateMilestoneUseCase;

  beforeEach(async () => {
    milestoneRepository = new InMemoryMilestoneRepository();
    tenderRepository = new InMemoryTenderRepository();
    clientPortfolio = await createClientPortfolioTestFixture("org-1");
    useCase = new CreateMilestoneUseCase(
      milestoneRepository,
      new FixedClock(),
      new SequentialIdGenerator(),
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
});
