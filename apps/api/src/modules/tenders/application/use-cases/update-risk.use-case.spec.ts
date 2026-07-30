import { beforeEach, describe, expect, it } from "vitest";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import { Risk } from "../../domain/risk.entity";
import { RiskNotFoundError, TenderNotFoundError, TenderPermissionMissingError } from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import {
  createClientPortfolioTestFixture,
  DEFAULT_TEST_CLIENT_ACCOUNT_ID,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryRiskRepository,
  InMemoryTenderRepository,
} from "../../test-support/fakes";
import { ChangeRiskStatusUseCase, UpdateRiskUseCase } from "./update-risk.use-case";

describe("UpdateRiskUseCase / ChangeRiskStatusUseCase", () => {
  let riskRepository: InMemoryRiskRepository;
  let tenderRepository: InMemoryTenderRepository;
  let clientPortfolio: Awaited<ReturnType<typeof createClientPortfolioTestFixture>>;
  let updateUseCase: UpdateRiskUseCase;
  let changeStatusUseCase: ChangeRiskStatusUseCase;

  beforeEach(async () => {
    riskRepository = new InMemoryRiskRepository();
    tenderRepository = new InMemoryTenderRepository();
    clientPortfolio = await createClientPortfolioTestFixture("org-1");
    updateUseCase = new UpdateRiskUseCase(
      riskRepository,
      new FixedClock(),
      tenderRepository,
      clientPortfolio.assertClientAccessUseCase,
    );
    changeStatusUseCase = new ChangeRiskStatusUseCase(
      riskRepository,
      new InMemoryAuditLogWriter(),
      new FixedClock(),
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
    await riskRepository.save(
      Risk.create({
        id: "risk-1",
        organizationId: "org-1",
        tenderId: "tender-1",
        title: "Delai tres court",
        severity: "CRITICAL",
        occurredAt: new Date(),
      }),
    );
  });

  describe("update", () => {
    it("updates the editable fields", async () => {
      const result = await updateUseCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        riskId: "risk-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        title: "Delai revise",
      });

      expect(result.title).toBe("Delai revise");
    });

    it("throws TenderNotFoundError when the tender does not belong to the caller's organization", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-2",
          tenderId: "tender-1",
          riskId: "risk-1",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          title: "x",
        }),
      ).rejects.toThrow(TenderNotFoundError);
    });

    it("throws RiskNotFoundError for an unknown risk id", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          riskId: "unknown",
          actorId: "user-1",
          actorRole: "BID_MANAGER",
          title: "x",
        }),
      ).rejects.toThrow(RiskNotFoundError);
    });

    it("refuses when the actor lacks tender:manage_risks", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          riskId: "risk-1",
          actorId: "user-1",
          actorRole: "READ_ONLY",
          title: "x",
        }),
      ).rejects.toThrow(TenderPermissionMissingError);
    });

    it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:manage_risks", async () => {
      await expect(
        updateUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          riskId: "risk-1",
          actorId: "user-unaffiliated",
          actorRole: "BID_MANAGER",
          title: "x",
        }),
      ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
    });
  });

  describe("changeStatus", () => {
    it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:manage_risks", async () => {
      await expect(
        changeStatusUseCase.execute({
          organizationId: "org-1",
          tenderId: "tender-1",
          riskId: "risk-1",
          actorId: "user-unaffiliated",
          actorRole: "BID_MANAGER",
          status: "MITIGATED",
        }),
      ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
    });
  });
});
