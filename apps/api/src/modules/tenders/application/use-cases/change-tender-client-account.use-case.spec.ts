import { beforeEach, describe, expect, it } from "vitest";
import { ClientAccountArchivedError } from "../../../client-portfolio";
import { ClientAccount } from "../../../client-portfolio/domain/client-account.aggregate";
import { ClientAssignment } from "../../../client-portfolio/domain/client-assignment.entity";
import { ClientRole } from "../../../client-portfolio/domain/client-role";
import { TenderCandidateChangeNotAllowedError, TenderNotFoundError } from "../../domain/errors";
import { TenderId } from "../../domain/tender-id.value-object";
import { Tender } from "../../domain/tender.aggregate";
import { TenderStatus } from "../../domain/tender-status";
import {
  createClientPortfolioTestFixture,
  FakeOutboxWriter,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryTenderRepository,
} from "../../test-support/fakes";
import { ChangeTenderClientAccountUseCase } from "./change-tender-client-account.use-case";

describe("ChangeTenderClientAccountUseCase (V2 Sprint 3 §4)", () => {
  let tenderRepository: InMemoryTenderRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let outboxWriter: FakeOutboxWriter;
  let clientPortfolio: Awaited<ReturnType<typeof createClientPortfolioTestFixture>>;
  let useCase: ChangeTenderClientAccountUseCase;

  const SECOND_CLIENT_ID = "client-2";

  beforeEach(async () => {
    tenderRepository = new InMemoryTenderRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    outboxWriter = new FakeOutboxWriter();
    clientPortfolio = await createClientPortfolioTestFixture("org-1");
    useCase = new ChangeTenderClientAccountUseCase(
      tenderRepository,
      auditLogWriter,
      new FixedClock(),
      outboxWriter,
      clientPortfolio.getClientAccountUseCase,
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

  async function seedSecondClient(status: "active" | "archived" = "active"): Promise<void> {
    const client = ClientAccount.create({
      id: SECOND_CLIENT_ID,
      organizationId: "org-1",
      name: "Deuxieme client",
      createdBy: "user-1",
      occurredAt: new Date("2026-01-01T00:00:00Z"),
    });
    if (status === "archived") {
      client.archive(new Date("2026-01-02T00:00:00Z"));
    }
    await clientPortfolio.clientAccountRepository.create(client);
    await clientPortfolio.clientAssignmentRepository.create(
      ClientAssignment.create({
        id: "assignment-user-1-client-2",
        organizationId: "org-1",
        clientAccountId: SECOND_CLIENT_ID,
        userId: "user-1",
        role: ClientRole.ClientManager,
        createdBy: "user-1",
        occurredAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );
  }

  it("changes the candidate, records audit metadata and history, and emits TenderCandidateChanged", async () => {
    await seedSecondClient();

    const result = await useCase.execute({
      organizationId: "org-1",
      tenderId: "tender-1",
      actorId: "user-1",
      actorRole: "ORGANIZATION_ADMIN",
      clientAccountId: SECOND_CLIENT_ID,
      reason: "Erreur de saisie initiale",
    });

    expect(result.clientAccountId).toBe(SECOND_CLIENT_ID);
    expect(auditLogWriter.entries[0]).toMatchObject({
      action: "tender.candidate_changed",
      metadata: { previousClientAccountId: "client-1", newClientAccountId: SECOND_CLIENT_ID },
    });
    expect(outboxWriter.writes[0]?.events[0]).toMatchObject({ eventType: "TenderCandidateChanged" });
  });

  it("refuses once the tender has moved past IN_ANALYSIS (domain rule, not duplicated here)", async () => {
    await seedSecondClient();
    const tender = await tenderRepository.findById({ organizationId: "org-1", tenderId: "tender-1" });
    tender!.changeStatus(TenderStatus.InAnalysis, new Date());
    tender!.changeStatus(TenderStatus.Ready, new Date());
    await tenderRepository.save(tender!);

    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "ORGANIZATION_ADMIN",
        clientAccountId: SECOND_CLIENT_ID,
      }),
    ).rejects.toThrow(TenderCandidateChangeNotAllowedError);
  });

  it("refuses when the new client account is archived", async () => {
    await seedSecondClient("archived");

    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "ORGANIZATION_ADMIN",
        clientAccountId: SECOND_CLIENT_ID,
      }),
    ).rejects.toThrow(ClientAccountArchivedError);
  });

  it("refuses when the actor has no access to the NEW client account (mission §16 — jamais rattacher vers un client inaccessible)", async () => {
    // Deuxième client existe mais SANS affectation pour user-1 (contrairement à seedSecondClient()).
    const client = ClientAccount.create({
      id: SECOND_CLIENT_ID,
      organizationId: "org-1",
      name: "Deuxieme client",
      createdBy: "user-1",
      occurredAt: new Date("2026-01-01T00:00:00Z"),
    });
    await clientPortfolio.clientAccountRepository.create(client);

    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        clientAccountId: SECOND_CLIENT_ID,
      }),
    ).rejects.toMatchObject({ code: "CLIENT_ACCOUNT_NOT_FOUND" });
  });

  it("refuses a CONTRIBUTOR-tier actor even though it can read/update the tender (ChangeTenderCandidate is a distinct, stricter permission)", async () => {
    await seedSecondClient();
    await clientPortfolio.clientAssignmentRepository.create(
      ClientAssignment.create({
        id: "assignment-contributor-client-1",
        organizationId: "org-1",
        clientAccountId: "client-1",
        userId: "user-contributor",
        role: ClientRole.Contributor,
        createdBy: "user-1",
        occurredAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );

    await expect(
      useCase.execute({
        organizationId: "org-1",
        tenderId: "tender-1",
        actorId: "user-contributor",
        actorRole: "BID_MANAGER",
        clientAccountId: SECOND_CLIENT_ID,
      }),
    ).rejects.toMatchObject({ code: "CLIENT_PERMISSION_MISSING" });
  });

  it("throws TenderNotFoundError when the tender does not belong to the caller's organization", async () => {
    await seedSecondClient();

    await expect(
      useCase.execute({
        organizationId: "org-2",
        tenderId: "tender-1",
        actorId: "user-1",
        actorRole: "ORGANIZATION_ADMIN",
        clientAccountId: SECOND_CLIENT_ID,
      }),
    ).rejects.toThrow(TenderNotFoundError);
  });
});
