import { beforeEach, describe, expect, it } from "vitest";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import { InvalidTenderStatusTransitionError, TenderPermissionMissingError } from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import {
  createClientPortfolioTestFixture,
  FakeOutboxWriter,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryTenderRepository,
  InMemoryTenderStatusHistoryRepository,
} from "../../test-support/fakes";
import { ChangeTenderStatusUseCase } from "./change-tender-status.use-case";

describe("ChangeTenderStatusUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let statusHistoryRepository: InMemoryTenderStatusHistoryRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let clientPortfolio: Awaited<ReturnType<typeof createClientPortfolioTestFixture>>;
  let useCase: ChangeTenderStatusUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    statusHistoryRepository = new InMemoryTenderStatusHistoryRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    clientPortfolio = await createClientPortfolioTestFixture("org-1");
    useCase = new ChangeTenderStatusUseCase(
      tenderRepository,
      statusHistoryRepository,
      auditLogWriter,
      new FixedClock(),
      new FakeOutboxWriter(),
      clientPortfolio.assertClientAccessUseCase,
    );

    await tenderRepository.seed(
      Tender.create({
        id: TenderId.from("tender-1"),
        organizationId: "org-1",
        clientAccountId: "client-1",
        title: "Marche de nettoyage",
        createdBy: "user-1",
        occurredAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );
  });

  it("applies a valid transition, appends history, and records an audit entry", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "BID_MANAGER",
      status: "IN_ANALYSIS",
    });

    expect(result.status).toBe("IN_ANALYSIS");
    expect(statusHistoryRepository.entries).toHaveLength(1);
    expect(statusHistoryRepository.entries[0]).toMatchObject({ previousStatus: "DRAFT", newStatus: "IN_ANALYSIS" });
    expect(auditLogWriter.entries[0]?.action).toBe("tender.status_changed");
  });

  it("rejects a transition that skips the funnel", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        status: "SUBMITTED",
      }),
    ).rejects.toThrow(InvalidTenderStatusTransitionError);

    expect(statusHistoryRepository.entries).toHaveLength(0);
  });

  it("refuses when the actor lacks tender:update", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "READ_ONLY",
        status: "IN_ANALYSIS",
      }),
    ).rejects.toThrow(TenderPermissionMissingError);
  });

  it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:update", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-unaffiliated",
        actorRole: "BID_MANAGER",
        status: "IN_ANALYSIS",
      }),
    ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
  });
});
