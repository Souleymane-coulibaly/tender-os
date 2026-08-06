import { beforeEach, describe, expect, it } from "vitest";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import { TenderLotMismatchError, TenderPermissionMissingError } from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { TenderLot } from "../../domain/tender-lot.entity";
import { Tender } from "../../domain/tender.aggregate";
import {
  createClientPortfolioTestFixture,
  DEFAULT_TEST_CLIENT_ACCOUNT_ID,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryRiskRepository,
  InMemoryTenderLotRepository,
  InMemoryTenderRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import { CreateRiskUseCase } from "./create-risk.use-case";

describe("CreateRiskUseCase", () => {
  let riskRepository: InMemoryRiskRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let tenderRepository: InMemoryTenderRepository;
  let lotRepository: InMemoryTenderLotRepository;
  let clientPortfolio: Awaited<ReturnType<typeof createClientPortfolioTestFixture>>;
  let useCase: CreateRiskUseCase;

  beforeEach(async () => {
    riskRepository = new InMemoryRiskRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    tenderRepository = new InMemoryTenderRepository();
    lotRepository = new InMemoryTenderLotRepository();
    clientPortfolio = await createClientPortfolioTestFixture("org-1");
    useCase = new CreateRiskUseCase(
      riskRepository,
      auditLogWriter,
      new FixedClock(),
      new SequentialIdGenerator(),
      tenderRepository,
      lotRepository,
      clientPortfolio.assertClientAccessUseCase,
    );

    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-1"),
        organizationId: "org-1",
        clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
        title: "Marche de nettoyage",
        createdBy: "user-1",
        occurredAt: new Date(),
      }),
    );
  });

  it("creates an OPEN risk and records an audit entry when the actor can manage risks", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      title: "Delai tres court",
      severity: "CRITICAL",
    });

    expect(result.status).toBe("OPEN");
    expect(auditLogWriter.entries[0]?.action).toBe("tender.risk_created");
  });

  it("refuses when the actor lacks tender:manage_risks (e.g. READ_ONLY)", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "READ_ONLY",
        title: "Delai tres court",
        severity: "CRITICAL",
      }),
    ).rejects.toThrow(TenderPermissionMissingError);

    expect(auditLogWriter.entries).toHaveLength(0);
  });

  it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:manage_risks", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-unaffiliated",
        actorRole: "BID_MANAGER",
        title: "Delai tres court",
        severity: "CRITICAL",
      }),
    ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
  });

  it("correction audit Codex P1 — refuses a lotId that belongs to a DIFFERENT tender of the same organization (IDOR horizontal)", async () => {
    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-2"),
        organizationId: "org-1",
        clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
        title: "Autre marche",
        createdBy: "user-1",
        occurredAt: new Date(),
      }),
    );
    await lotRepository.seed(
      TenderLot.create({
        id: "lot-tender-2",
        organizationId: "org-1",
        tenderId: "tender-2",
        lotNumber: "01",
        title: "Lot du tender 2",
        displayOrder: 0,
        occurredAt: new Date(),
      }),
    );

    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        title: "Delai tres court",
        severity: "CRITICAL",
        lotId: "lot-tender-2",
      }),
    ).rejects.toThrow(TenderLotMismatchError);
  });
});
