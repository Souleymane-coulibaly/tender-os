import { beforeEach, describe, expect, it } from "vitest";
import { TenderNotFoundError, TenderPermissionMissingError } from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import { InMemoryTenderRepository } from "../../test-support/fakes";
import { GetTenderUseCase } from "./get-tender.use-case";

describe("GetTenderUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let useCase: GetTenderUseCase;

  beforeEach(() => {
    tenderRepository = new InMemoryTenderRepository();
    useCase = new GetTenderUseCase(tenderRepository);
  });

  it("returns the tender when it belongs to the caller's organization", async () => {
    const tender = Tender.create({
      id: TenderId.from("tender-1"),
      organizationId: "org-1",
      title: "Marche de nettoyage",
      createdBy: "user-1",
      occurredAt: new Date(),
    });
    await tenderRepository.seed(tender);

    const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorRole: "READ_ONLY" });

    expect(result.id).toBe("tender-1");
  });

  it("throws TenderNotFoundError for a tender belonging to another organization", async () => {
    const tender = Tender.create({
      id: TenderId.from("tender-1"),
      organizationId: "org-2",
      title: "Marche of another org",
      createdBy: "user-1",
      occurredAt: new Date(),
    });
    await tenderRepository.seed(tender);

    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorRole: "READ_ONLY" }),
    ).rejects.toThrow(TenderNotFoundError);
  });

  it("refuses when the actor lacks tender:read", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorRole: "UNKNOWN_ROLE" }),
    ).rejects.toThrow(TenderPermissionMissingError);
  });
});
