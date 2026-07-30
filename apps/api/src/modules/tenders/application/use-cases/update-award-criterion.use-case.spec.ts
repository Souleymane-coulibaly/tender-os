import { beforeEach, describe, expect, it } from "vitest";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import { AwardCriterion } from "../../domain/award-criterion.entity";
import { AwardCriterionNotFoundError, TenderNotFoundError, TenderPermissionMissingError } from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import {
  createClientPortfolioTestFixture,
  DEFAULT_TEST_CLIENT_ACCOUNT_ID,
  FixedClock,
  InMemoryAwardCriterionRepository,
  InMemoryTenderRepository,
} from "../../test-support/fakes";
import { DeleteAwardCriterionUseCase, UpdateAwardCriterionUseCase } from "./update-award-criterion.use-case";

describe("UpdateAwardCriterionUseCase / DeleteAwardCriterionUseCase", () => {
  let criterionRepository: InMemoryAwardCriterionRepository;
  let tenderRepository: InMemoryTenderRepository;
  let clientPortfolio: Awaited<ReturnType<typeof createClientPortfolioTestFixture>>;
  let updateUseCase: UpdateAwardCriterionUseCase;
  let deleteUseCase: DeleteAwardCriterionUseCase;

  beforeEach(async () => {
    criterionRepository = new InMemoryAwardCriterionRepository();
    tenderRepository = new InMemoryTenderRepository();
    clientPortfolio = await createClientPortfolioTestFixture("org-1");
    updateUseCase = new UpdateAwardCriterionUseCase(
      criterionRepository,
      new FixedClock(),
      tenderRepository,
      clientPortfolio.assertClientAccessUseCase,
    );
    deleteUseCase = new DeleteAwardCriterionUseCase(
      criterionRepository,
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
    await criterionRepository.save(
      AwardCriterion.create({
        id: "criterion-1",
        organizationId: "org-1",
        tenderId: "tender-1",
        name: "Prix",
        weight: "60",
        occurredAt: new Date(),
      }),
    );
  });

  describe("update", () => {
    it("updates the editable fields", async () => {
      const result = await updateUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        criterionId: "criterion-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        name: "Prix revise",
      });

      expect(result.name).toBe("Prix revise");
    });

    it("throws TenderNotFoundError when the tender does not belong to the caller's organization", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-2",
          tenderId: "tender-1",
          criterionId: "criterion-1",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          name: "x",
        }),
      ).rejects.toThrow(TenderNotFoundError);
    });

    it("throws AwardCriterionNotFoundError for an unknown criterion id", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          criterionId: "unknown",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          name: "x",
        }),
      ).rejects.toThrow(AwardCriterionNotFoundError);
    });

    it("refuses when the actor lacks tender:update", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          criterionId: "criterion-1",
          actorId: "user-1",
          actorRole: "READ_ONLY",
          name: "x",
        }),
      ).rejects.toThrow(TenderPermissionMissingError);
    });

    it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:update", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          criterionId: "criterion-1",
          actorId: "user-unaffiliated",
          actorRole: "BID_MANAGER",
          name: "x",
        }),
      ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
    });
  });

  describe("delete", () => {
    it("deletes the criterion", async () => {
      await deleteUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        criterionId: "criterion-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
      });

      await expect(
        criterionRepository.findById({ organizationId: "org-1", tenderId: "tender-1", criterionId: "criterion-1" }),
      ).resolves.toBeNull();
    });

    it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:update", async () => {
      await expect(
        deleteUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          criterionId: "criterion-1",
          actorId: "user-unaffiliated",
          actorRole: "BID_MANAGER",
        }),
      ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
    });
  });
});
