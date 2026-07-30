import { beforeEach, describe, expect, it } from "vitest";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import { TenderPermissionMissingError } from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import {
  createClientPortfolioTestFixture,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryTenderRepository,
  InMemoryTenderStatusHistoryRepository,
} from "../../test-support/fakes";
import { ArchiveTenderUseCase } from "./archive-tender.use-case";

describe("ArchiveTenderUseCase", () => {
  let tenderRepository: InMemoryTenderRepository;
  let statusHistoryRepository: InMemoryTenderStatusHistoryRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let clientPortfolio: Awaited<ReturnType<typeof createClientPortfolioTestFixture>>;
  let useCase: ArchiveTenderUseCase;

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    statusHistoryRepository = new InMemoryTenderStatusHistoryRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    clientPortfolio = await createClientPortfolioTestFixture("org-1");
    useCase = new ArchiveTenderUseCase(
      tenderRepository,
      statusHistoryRepository,
      auditLogWriter,
      new FixedClock(),
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

  it("archives the tender, stamps archivedAt, and records history and audit", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "ORGANIZATION_ADMIN",
      reason: "Appel d'offres annule par l'acheteur",
    });

    expect(result.status).toBe("ARCHIVED");
    expect(result.archivedAt).toBeDefined();
    expect(statusHistoryRepository.entries[0]).toMatchObject({ newStatus: "ARCHIVED" });
    expect(auditLogWriter.entries[0]?.action).toBe("tender.archived");
  });

  it("refuses when the actor lacks tender:archive", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "CONTRIBUTOR",
      }),
    ).rejects.toThrow(TenderPermissionMissingError);
  });

  it("correction P0 — refuses a MEMBER-tier actor with no assignment on the tender's client, even with tender:archive (BID_MANAGER)", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-unaffiliated",
        actorRole: "BID_MANAGER",
      }),
    ).rejects.toBeInstanceOf(ClientAccountNotFoundError);
  });
});
