import { beforeEach, describe, expect, it } from "vitest";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import {
  createClientPortfolioTestFixture,
  DEFAULT_TEST_CLIENT_ACCOUNT_ID,
  InMemoryTenderRepository,
  InMemoryTenderSearchProvider,
} from "../../test-support/fakes";
import { ListTendersUseCase } from "./list-tenders.use-case";

describe("ListTendersUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let useCase: ListTendersUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    const clientPortfolio = await createClientPortfolioTestFixture("org-1");
    useCase = new ListTendersUseCase(
      tenderRepository,
      new InMemoryTenderSearchProvider(tenderRepository),
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
    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-2"),
        organizationId: "org-1",
        clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
        title: "Fourniture de mobilier",
        createdBy: "user-1",
        occurredAt: new Date("2026-01-02T00:00:00Z"),
      }),
    );
    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-3"),
        organizationId: "org-2",
        clientAccountId: "client-other-org",
        title: "Marche d'une autre organisation",
        createdBy: "user-2",
        occurredAt: new Date("2026-01-03T00:00:00Z"),
      }),
    );
  });

  it("only returns tenders scoped to the caller's organization", async () => {
    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "READ_ONLY", limit: 10 });

    expect(result.items).toHaveLength(2);
    expect(result.items.every((item) => item.organizationId === "org-1")).toBe(true);
  });

  it("filters by search term", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "READ_ONLY",
      limit: 10,
      search: "mobilier",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("tender-2");
  });

  it("returns an empty page when the search matches nothing (never falls back to unfiltered)", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "READ_ONLY",
      limit: 10,
      search: "no-such-tender-anywhere",
    });

    expect(result.items).toHaveLength(0);
  });

  it("filters overdue tenders (past deadline, not submitted/won/lost/archived)", async () => {
    const overdueTender = Tender.create({
      id: TenderId.from("tender-4"),
      organizationId: "org-1",
      clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
      title: "Marche en retard",
      submissionDeadline: new Date("2020-01-01T00:00:00Z"),
      createdBy: "user-1",
      occurredAt: new Date("2026-01-04T00:00:00Z"),
    });
    await tenderRepository.seed(overdueTender);

    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "READ_ONLY",
      limit: 10,
      overdue: true,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("tender-4");
  });

  it("paginates with a cursor and limit", async () => {
    const firstPage = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "READ_ONLY", limit: 1 });

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "READ_ONLY",
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined,
    });

    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.id).not.toBe(firstPage.items[0]?.id);
    expect(secondPage.nextCursor).toBeNull();
  });
});
