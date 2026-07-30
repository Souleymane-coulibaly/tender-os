import { beforeEach, describe, expect, it } from "vitest";
import { TenderPermissionMissingError } from "../../domain/errors";
import { ChecklistItem } from "../../domain/checklist-item.entity";
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
import { GetTenderListViewUseCase } from "./get-tender-list-view.use-case";

describe("GetTenderListViewUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let checklistRepository: InMemoryChecklistItemRepository;
  let useCase: GetTenderListViewUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    checklistRepository = new InMemoryChecklistItemRepository();
    const clientPortfolio = await createClientPortfolioTestFixture("org-1");
    useCase = new GetTenderListViewUseCase(
      tenderRepository,
      checklistRepository,
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
  });

  it("enriches each row with readiness, open risks, and incomplete checklist counts", async () => {
    checklistRepository.items.push(
      ChecklistItem.create({
        id: "item-1",
        organizationId: "org-1",
        tenderId: "tender-1",
        title: "Piece obligatoire",
        required: true,
        occurredAt: new Date(),
      }),
    );

    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "READ_ONLY", limit: 10 });

    expect(result.items[0]?.incompleteChecklistCount).toBe(1);
    expect(result.items[0]?.readinessScore).toBeDefined();
    expect(result.items[0]?.readinessStatus).toBeDefined();
  });

  it("refuses when the actor lacks tender:list", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "UNKNOWN_ROLE", limit: 10 }),
    ).rejects.toThrow(TenderPermissionMissingError);
  });

  it("scopes rows to the caller's organization only", async () => {
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

    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "READ_ONLY", limit: 10 });

    expect(result.items.map((item) => item.id)).not.toContain("tender-other-org");
  });
});
