import { beforeEach, describe, expect, it } from "vitest";
import { TenderPermissionMissingError } from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import {
  createClientPortfolioTestFixture,
  DEFAULT_TEST_CLIENT_ACCOUNT_ID,
  FixedClock,
  InMemoryAlertRepository,
  InMemoryAwardCriterionRepository,
  InMemoryChecklistItemRepository,
  InMemoryMilestoneRepository,
  InMemoryRequestedDocumentRepository,
  InMemoryRiskRepository,
  InMemoryTenderRepository,
  InMemoryTenderSearchProvider,
} from "../../test-support/fakes";
import { GetTenderBoardUseCase } from "./get-tender-board.use-case";

describe("GetTenderBoardUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let useCase: GetTenderBoardUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    const clientPortfolio = await createClientPortfolioTestFixture("org-1");
    useCase = new GetTenderBoardUseCase(
      tenderRepository,
      new InMemoryChecklistItemRepository(),
      new InMemoryRequestedDocumentRepository(),
      new InMemoryAwardCriterionRepository(),
      new InMemoryMilestoneRepository(),
      new InMemoryRiskRepository(),
      new InMemoryAlertRepository(),
      new InMemoryTenderSearchProvider(tenderRepository),
      new FixedClock(),
      clientPortfolio.listAccessibleClientsUseCase,
    );

    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-1"),
        organizationId: "org-1",
        clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
        title: "Marche de nettoyage",
        createdBy: "user-1",
        occurredAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );
    const inAnalysis = Tender.create({
      id: TenderId.from("tender-2"),
      organizationId: "org-1",
      clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
      title: "Fourniture de mobilier",
      createdBy: "user-1",
      occurredAt: new Date("2026-01-02T00:00:00Z"),
    });
    inAnalysis.changeStatus("IN_ANALYSIS", new Date());
    await tenderRepository.seed(inAnalysis);
  });

  it("groups tenders into one column per real Tenders status, excluding ARCHIVED", async () => {
    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "READ_ONLY" });

    const statuses = result.columns.map((column) => column.status);
    expect(statuses).toContain("DRAFT");
    expect(statuses).toContain("IN_ANALYSIS");
    expect(statuses).not.toContain("ARCHIVED");

    const draftColumn = result.columns.find((column) => column.status === "DRAFT")!;
    expect(draftColumn.totalCount).toBe(1);
    expect(draftColumn.items[0]?.id).toBe("tender-1");
  });

  it("reports the true total count per column, not just the capped items", async () => {
    for (let i = 0; i < 3; i += 1) {
      await tenderRepository.seed(
        Tender.create({
          id: TenderId.from(`extra-draft-${i}`),
          organizationId: "org-1",
          clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
          title: `Extra draft ${i}`,
          createdBy: "user-1",
          occurredAt: new Date(),
        }),
      );
    }

    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "READ_ONLY",
      limitPerColumn: 2,
    });

    const draftColumn = result.columns.find((column) => column.status === "DRAFT")!;
    expect(draftColumn.totalCount).toBe(4);
    expect(draftColumn.items).toHaveLength(2);
  });

  it("scopes the board to the caller's organization only", async () => {
    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-other-org"),
        organizationId: "org-2",
        clientAccountId: "client-other-org",
        title: "Marche d'une autre organisation",
        createdBy: "user-2",
        occurredAt: new Date(),
      }),
    );

    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "READ_ONLY" });

    const allItemIds = result.columns.flatMap((column) => column.items.map((item) => item.id));
    expect(allItemIds).not.toContain("tender-other-org");
  });

  it("filters the board by free-text search", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "READ_ONLY",
      search: "mobilier",
    });

    const allItemIds = result.columns.flatMap((column) => column.items.map((item) => item.id));
    expect(allItemIds).toEqual(["tender-2"]);
  });

  it("refuses when the actor lacks tender:list", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "UNKNOWN_ROLE" }),
    ).rejects.toThrow(TenderPermissionMissingError);
  });
});
