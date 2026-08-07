import { describe, expect, it } from "vitest";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import { CreateTenderUseCase, GetTenderUseCase, TenderPermissionMissingError } from "../../../tenders";
import { InMemoryBuyerRepository, InMemoryTenderRepository, createClientPortfolioTestFixture, DEFAULT_TEST_CLIENT_ACCOUNT_ID } from "../../../tenders/test-support/fakes";
import { GoNoGoAdminBypassJustificationRequiredError, GoNoGoDecisionJustificationRequiredError } from "../../domain/errors";
import { FakeOutboxWriter, FixedClock, InMemoryAuditLogWriter, InMemoryGoNoGoDecisionRepository, InMemoryGoNoGoReportRepository, SequentialIdGenerator } from "../../test-support/fakes";
import { RecordTenderGoNoGoDecisionUseCase } from "./record-tender-go-no-go-decision.use-case";

const ORG = "org-1";

async function buildHarness() {
  const decisionRepository = new InMemoryGoNoGoDecisionRepository();
  const reportRepository = new InMemoryGoNoGoReportRepository();
  const tenderRepository = new InMemoryTenderRepository();
  const buyerRepository = new InMemoryBuyerRepository();
  const auditLogWriter = new InMemoryAuditLogWriter();
  const outboxWriter = new FakeOutboxWriter();
  const clock = new FixedClock();
  const clientPortfolio = await createClientPortfolioTestFixture(ORG);

  const createTenderUseCase = new CreateTenderUseCase(
    tenderRepository,
    buyerRepository,
    { record: async () => {} },
    clock,
    new SequentialIdGenerator(),
    outboxWriter,
    clientPortfolio.getClientAccountUseCase,
    clientPortfolio.assertClientAccessUseCase,
  );
  const getTenderUseCase = new GetTenderUseCase(tenderRepository, clientPortfolio.assertClientAccessUseCase);

  const useCase = new RecordTenderGoNoGoDecisionUseCase(
    decisionRepository,
    reportRepository,
    auditLogWriter,
    outboxWriter,
    clock,
    new SequentialIdGenerator(),
    getTenderUseCase,
    clientPortfolio.assertClientAccessUseCase,
  );

  const tender = await createTenderUseCase.execute({
    organizationId: ORG,
    actorId: "user-1",
    actorRole: "BID_MANAGER",
    clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
    title: "Marché de nettoyage",
  });

  return { decisionRepository, auditLogWriter, useCase, tenderId: tender.id };
}

describe("RecordTenderGoNoGoDecisionUseCase", () => {
  it("records a GO decision, never touching Tender.status", async () => {
    const { decisionRepository, useCase, tenderId } = await buildHarness();

    const record = await useCase.execute({ organizationId: ORG, tenderId, actorId: "user-1", actorRole: "BID_MANAGER", decision: "GO" });

    expect(record.decision).toBe("GO");
    const history = await decisionRepository.listByTender({ organizationId: ORG, tenderId });
    expect(history).toHaveLength(1);
  });

  it("refuses a NO_GO decision without a justification", async () => {
    const { useCase, tenderId } = await buildHarness();

    await expect(useCase.execute({ organizationId: ORG, tenderId, actorId: "user-1", actorRole: "BID_MANAGER", decision: "NO_GO" })).rejects.toThrow(GoNoGoDecisionJustificationRequiredError);
  });

  /**
   * Audit Codex round 2 (P1 confirmé) — la restriction "CLIENT_MANAGER uniquement" vit au palier
   * client (`resolveGoNoGoClientAccess`), jamais au palier organisation : "user-2" n'a aucune
   * affectation sur le client du Tender (seul "user-1" en a une, via
   * `createClientPortfolioTestFixture`) et n'est ni OWNER ni ORGANIZATION_ADMIN.
   */
  it("refuses a BID_MANAGER without a real CLIENT_MANAGER assignment on the tender's client (no admin bypass)", async () => {
    const { useCase, tenderId } = await buildHarness();

    await expect(useCase.execute({ organizationId: ORG, tenderId, actorId: "user-2", actorRole: "BID_MANAGER", decision: "GO" })).rejects.toThrow(ClientAccountNotFoundError);
  });

  it("refuses a CONTRIBUTOR outright at the organization tier (never granted TenderPermission.RecordGoNoGoDecision)", async () => {
    const { useCase, tenderId } = await buildHarness();

    await expect(useCase.execute({ organizationId: ORG, tenderId, actorId: "user-1", actorRole: "CONTRIBUTOR", decision: "GO" })).rejects.toThrow(TenderPermissionMissingError);
  });

  it("refuses an OWNER without a real client assignment when no justification is provided (admin bypass always tracked)", async () => {
    const { useCase, tenderId } = await buildHarness();

    await expect(useCase.execute({ organizationId: ORG, tenderId, actorId: "user-2", actorRole: "OWNER", decision: "GO" })).rejects.toThrow(GoNoGoAdminBypassJustificationRequiredError);
  });

  it("lets an OWNER without a real client assignment decide with a justification, and records the bypass in the audit log", async () => {
    const { auditLogWriter, useCase, tenderId } = await buildHarness();

    const record = await useCase.execute({
      organizationId: ORG,
      tenderId,
      actorId: "user-2",
      actorRole: "OWNER",
      decision: "GO",
      justification: "Client account manager on leave — approving under administrative privilege.",
    });

    expect(record.decision).toBe("GO");
    const bypassEntry = auditLogWriter.entries.find((entry) => entry.action === "tender.go_no_go_decision_recorded");
    expect(bypassEntry?.metadata).toEqual({ clientAssignmentBypass: true });
  });

  it("never marks the audit log as a bypass for the normal CLIENT_MANAGER-assigned path", async () => {
    const { auditLogWriter, useCase, tenderId } = await buildHarness();

    await useCase.execute({ organizationId: ORG, tenderId, actorId: "user-1", actorRole: "BID_MANAGER", decision: "GO" });

    const entry = auditLogWriter.entries.find((entry) => entry.action === "tender.go_no_go_decision_recorded");
    expect(entry?.metadata).toBeUndefined();
  });
});
