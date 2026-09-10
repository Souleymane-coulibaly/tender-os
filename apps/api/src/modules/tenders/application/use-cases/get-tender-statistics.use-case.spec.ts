import { beforeEach, describe, expect, it } from "vitest";
import { TenderPermissionMissingError } from "../../domain/errors";
import { Risk } from "../../domain/risk.entity";
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
  InMemoryRiskRepository,
  InMemoryTenderRepository,
} from "../../test-support/fakes";
import { GetTenderStatisticsUseCase } from "./get-tender-statistics.use-case";

describe("GetTenderStatisticsUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let riskRepository: InMemoryRiskRepository;
  let useCase: GetTenderStatisticsUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    riskRepository = new InMemoryRiskRepository();
    const clientPortfolio = await createClientPortfolioTestFixture("org-1");
    useCase = new GetTenderStatisticsUseCase(
      tenderRepository,
      new InMemoryChecklistItemRepository(),
      new InMemoryAwardCriterionRepository(),
      new InMemoryMilestoneRepository(),
      riskRepository,
      new InMemoryAlertRepository(),
      new FixedClock(),
      clientPortfolio.listAccessibleClientsUseCase,
    );
  });

  it("excludes ARCHIVED tenders from totalActive and byStatus stays accurate", async () => {
    const active = Tender.create({
      id: TenderId.from("tender-active"),
      organizationId: "org-1",
      clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
      title: "Marche actif",
      createdBy: "user-1",
      occurredAt: new Date(),
    });
    await tenderRepository.seed(active);

    const archived = Tender.create({
      id: TenderId.from("tender-archived"),
      organizationId: "org-1",
      clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
      title: "Marche archive",
      createdBy: "user-1",
      occurredAt: new Date(),
    });
    archived.changeStatus("ARCHIVED", new Date());
    await tenderRepository.seed(archived);

    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "READ_ONLY" });

    expect(result.totalActive).toBe(1);
    expect(result.byStatus["ARCHIVED"]).toBe(1);
  });

  it("counts overdue tenders and reports readyToSubmitCount", async () => {
    const overdue = Tender.create({
      id: TenderId.from("tender-overdue"),
      organizationId: "org-1",
      clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
      title: "Marche en retard",
      submissionDeadline: new Date("2020-01-01T00:00:00Z"),
      createdBy: "user-1",
      occurredAt: new Date(),
    });
    await tenderRepository.seed(overdue);

    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "READ_ONLY" });

    expect(result.overdueCount).toBe(1);
    expect(result.readyToSubmitCount).toBe(0);
  });

  it("counts a tender with an unresolved critical risk as at-risk (same definition as the readiness engine)", async () => {
    const tender = Tender.create({
      id: TenderId.from("tender-at-risk"),
      organizationId: "org-1",
      clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
      title: "Marche a risque",
      createdBy: "user-1",
      occurredAt: new Date(),
    });
    await tenderRepository.seed(tender);
    await riskRepository.seed(
      Risk.create({
        id: "risk-1",
        organizationId: "org-1",
        tenderId: "tender-at-risk",
        title: "Risque majeur",
        severity: "CRITICAL",
        occurredAt: new Date(),
      }),
    );

    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "READ_ONLY" });

    expect(result.atRiskCount).toBe(1);
  });

  it("scopes statistics to the caller's organization only", async () => {
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

    expect(result.totalActive).toBe(0);
  });

  it("refuses when the actor lacks tender:list", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "UNKNOWN_ROLE" }),
    ).rejects.toThrow(
      TenderPermissionMissingError,
    );
  });
});
