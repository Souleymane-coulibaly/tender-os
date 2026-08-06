import { beforeEach, describe, expect, it } from "vitest";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import {
  DuplicateTenderLotNumberError,
  InvalidLotEstimatedAmountError,
  TenderArchivedError,
  TenderNotFoundError,
  TenderPermissionMissingError,
} from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import { TenderStatus } from "../../domain/tender-status";
import {
  createClientPortfolioTestFixture,
  FakeOutboxWriter,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryTenderLotRepository,
  InMemoryTenderRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import { CreateTenderLotUseCase } from "./create-tender-lot.use-case";

describe("CreateTenderLotUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let lotRepository: InMemoryTenderLotRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let clientPortfolio: Awaited<ReturnType<typeof createClientPortfolioTestFixture>>;
  let useCase: CreateTenderLotUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    lotRepository = new InMemoryTenderLotRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    clientPortfolio = await createClientPortfolioTestFixture("org-1");
    useCase = new CreateTenderLotUseCase(
      tenderRepository,
      lotRepository,
      auditLogWriter,
      new FixedClock(),
      new SequentialIdGenerator(),
      new FakeOutboxWriter(),
      clientPortfolio.assertClientAccessUseCase,
    );

    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-1"),
        organizationId: "org-1",
        clientAccountId: "client-1",
        title: "Marche de travaux",
        createdBy: "user-1",
        occurredAt: new Date(),
      }),
    );
  });

  it("creates a lot appended at the end of the list (displayOrder computed, never accepted as input)", async () => {
    await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      lotNumber: "01",
      title: "Lot travaux",
    });

    const second = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      lotNumber: "02",
      title: "Lot equipements",
    });

    expect(second.displayOrder).toBe(1);
  });

  it("records an audit entry on creation (AUDIT-006)", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      lotNumber: "01",
      title: "Lot travaux",
      requestId: "request-1",
    });

    expect(auditLogWriter.entries).toHaveLength(1);
    expect(auditLogWriter.entries[0]).toMatchObject({
      organizationId: "org-1",
      actorId: "user-1",
      action: "tender_lot.created",
      resourceType: "tender_lot",
      resourceId: result.id,
      requestId: "request-1",
    });
  });

  it("refuses a duplicate lot number for the same tender", async () => {
    await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      lotNumber: "01",
      title: "Lot travaux",
    });

    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        lotNumber: "01",
        title: "Autre lot",
      }),
    ).rejects.toThrow(DuplicateTenderLotNumberError);
  });

  it("throws TenderNotFoundError when the tender does not belong to the caller's organization", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-2",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        lotNumber: "01",
        title: "Lot travaux",
      }),
    ).rejects.toThrow(TenderNotFoundError);
  });

  it("throws TenderArchivedError when the tender is archived (AUDIT-001)", async () => {
    const tender = await tenderRepository.findById({ organizationId: "org-1", tenderId: "tender-1" });
    tender!.changeStatus(TenderStatus.Archived, new Date());
    await tenderRepository.save(tender!);

    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        lotNumber: "01",
        title: "Lot travaux",
      }),
    ).rejects.toThrow(TenderArchivedError);
    expect(auditLogWriter.entries).toHaveLength(0);
  });

  it("refuses when the actor lacks tender:update", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "READ_ONLY",
        lotNumber: "01",
        title: "Lot travaux",
      }),
    ).rejects.toThrow(TenderPermissionMissingError);
  });

  it("rejects an invalid estimated amount with a business error, never a Prisma-level failure (AUDIT-003)", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        lotNumber: "01",
        title: "Lot travaux",
        estimatedAmount: "not-a-number",
      }),
    ).rejects.toThrow(InvalidLotEstimatedAmountError);
  });

  it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:update", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-unaffiliated",
        actorRole: "BID_MANAGER",
        lotNumber: "01",
        title: "Lot travaux",
      }),
    ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
  });
});
