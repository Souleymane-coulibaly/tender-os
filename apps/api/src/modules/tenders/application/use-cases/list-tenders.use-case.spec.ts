import { beforeEach, describe, expect, it } from "vitest";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import { InMemoryTenderRepository } from "../../test-support/fakes";
import { ListTendersUseCase } from "./list-tenders.use-case";

describe("ListTendersUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let useCase: ListTendersUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    useCase = new ListTendersUseCase(tenderRepository);

    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-1"),
        organizationId: "org-1",
        title: "Marche de nettoyage",
        createdBy: "user-1",
        occurredAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );
    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-2"),
        organizationId: "org-1",
        title: "Fourniture de mobilier",
        createdBy: "user-1",
        occurredAt: new Date("2026-01-02T00:00:00Z"),
      }),
    );
    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-3"),
        organizationId: "org-2",
        title: "Marche d'une autre organisation",
        createdBy: "user-2",
        occurredAt: new Date("2026-01-03T00:00:00Z"),
      }),
    );
  });

  it("only returns tenders scoped to the caller's organization", async () => {
    const result = await useCase.execute({ organizationId: "org-1", actorRole: "READ_ONLY", limit: 10 });

    expect(result.items).toHaveLength(2);
    expect(result.items.every((item) => item.organizationId === "org-1")).toBe(true);
  });

  it("filters by search term", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      actorRole: "READ_ONLY",
      limit: 10,
      search: "mobilier",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("tender-2");
  });

  it("paginates with a cursor and limit", async () => {
    const firstPage = await useCase.execute({ organizationId: "org-1", actorRole: "READ_ONLY", limit: 1 });

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await useCase.execute({
      organizationId: "org-1",
      actorRole: "READ_ONLY",
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined,
    });

    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.id).not.toBe(firstPage.items[0]?.id);
    expect(secondPage.nextCursor).toBeNull();
  });
});
