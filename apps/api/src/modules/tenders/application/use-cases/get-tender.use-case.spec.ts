import { beforeEach, describe, expect, it } from "vitest";
import { AssertClientAccessUseCase, ClientAccountNotFoundError } from "../../../client-portfolio";
import { ClientAssignment } from "../../../client-portfolio/domain/client-assignment.entity";
import { ClientRole } from "../../../client-portfolio/domain/client-role";
import { InMemoryClientAssignmentRepository } from "../../../client-portfolio/test-support/fakes";
import { TenderNotFoundError, TenderPermissionMissingError } from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import { InMemoryTenderRepository } from "../../test-support/fakes";
import { GetTenderUseCase } from "./get-tender.use-case";

describe("GetTenderUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let clientAssignmentRepository: InMemoryClientAssignmentRepository;
  let useCase: GetTenderUseCase;

  beforeEach(() => {
    tenderRepository = new InMemoryTenderRepository();
    clientAssignmentRepository = new InMemoryClientAssignmentRepository();
    useCase = new GetTenderUseCase(tenderRepository, new AssertClientAccessUseCase(clientAssignmentRepository));
  });

  it("returns the tender when it belongs to the caller's organization", async () => {
    const tender = Tender.create({
      id: TenderId.from("tender-1"),
      organizationId: "org-1",
      clientAccountId: "client-1",
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
      clientAccountId: "client-1",
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

  describe("client isolation (mission Sprint 5.1 — actorId provided)", () => {
    it("a MEMBER-tier actor with no assignment on the tender's client cannot read it, even with tender:read", async () => {
      const tender = Tender.create({
        id: TenderId.from("tender-1"),
        organizationId: "org-1",
        clientAccountId: "client-1",
        title: "Marche",
        createdBy: "user-1",
        occurredAt: new Date(),
      });
      await tenderRepository.seed(tender);

      await expect(
        useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorRole: "BID_MANAGER", actorId: "user-2" }),
      ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
    });

    it("a MEMBER-tier actor assigned to the tender's client can read it", async () => {
      const tender = Tender.create({
        id: TenderId.from("tender-1"),
        organizationId: "org-1",
        clientAccountId: "client-1",
        title: "Marche",
        createdBy: "user-1",
        occurredAt: new Date(),
      });
      await tenderRepository.seed(tender);
      await clientAssignmentRepository.create(
        ClientAssignment.create({
          id: "assignment-1",
          organizationId: "org-1",
          clientAccountId: "client-1",
          userId: "user-2",
          role: ClientRole.Viewer,
          createdBy: "user-1",
          occurredAt: new Date(),
        }),
      );

      const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorRole: "BID_MANAGER", actorId: "user-2" });
      expect(result.id).toBe("tender-1");
    });

    it("OWNER can read a tender for a client it has no explicit assignment on", async () => {
      const tender = Tender.create({
        id: TenderId.from("tender-1"),
        organizationId: "org-1",
        clientAccountId: "client-1",
        title: "Marche",
        createdBy: "user-1",
        occurredAt: new Date(),
      });
      await tenderRepository.seed(tender);

      const result = await useCase.execute({ organizationId: "org-1", tenderId: "tender-1", actorRole: "OWNER", actorId: "user-99" });
      expect(result.id).toBe("tender-1");
    });
  });
});
