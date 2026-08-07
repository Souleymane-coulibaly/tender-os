import { describe, expect, it } from "vitest";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import { createClientPortfolioTestFixture, DEFAULT_TEST_CLIENT_ACCOUNT_ID } from "../../../tenders/test-support/fakes";
import {
  GoNoGoAdminBypassJustificationRequiredError,
  GoNoGoDecisionConditionsRequiredError,
  GoNoGoDecisionJustificationRequiredError,
  InvalidOpportunityStatusTransitionError,
  OpportunityPermissionMissingError,
} from "../../domain/errors";
import { Opportunity } from "../../domain/opportunity.aggregate";
import { OpportunityId } from "../../domain/opportunity-id.value-object";
import { OpportunityStatus } from "../../domain/opportunity-status";
import { FakeAtomicTransactionRunner, FakeOutboxWriter, FixedClock, InMemoryAuditLogWriter, InMemoryGoNoGoDecisionRepository, InMemoryOpportunityQuickScoreRepository, InMemoryOpportunityRepository, SequentialIdGenerator } from "../../test-support/fakes";
import { RecordOpportunityGoNoGoDecisionUseCase } from "./record-opportunity-go-no-go-decision.use-case";

const ORG = "org-1";

function qualifiedOpportunity(): Opportunity {
  const opportunity = Opportunity.create({
    id: OpportunityId.from("opportunity-1"),
    organizationId: ORG,
    clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
    title: "Marché de nettoyage",
    createdBy: "user-1",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
  });
  opportunity.changeStatus(OpportunityStatus.ToQualify, new Date());
  opportunity.changeStatus(OpportunityStatus.Qualified, new Date());
  return opportunity;
}

async function buildHarness() {
  const opportunityRepository = new InMemoryOpportunityRepository();
  const decisionRepository = new InMemoryGoNoGoDecisionRepository();
  const quickScoreRepository = new InMemoryOpportunityQuickScoreRepository();
  const auditLogWriter = new InMemoryAuditLogWriter();
  const outboxWriter = new FakeOutboxWriter();
  const clientPortfolio = await createClientPortfolioTestFixture(ORG);
  const atomicTransactionRunner = new FakeAtomicTransactionRunner([opportunityRepository, decisionRepository]);

  const useCase = new RecordOpportunityGoNoGoDecisionUseCase(
    decisionRepository,
    opportunityRepository,
    quickScoreRepository,
    auditLogWriter,
    outboxWriter,
    new FixedClock(),
    new SequentialIdGenerator(),
    atomicTransactionRunner,
    clientPortfolio.assertClientAccessUseCase,
  );

  return { opportunityRepository, decisionRepository, quickScoreRepository, auditLogWriter, outboxWriter, useCase, clientPortfolio };
}

describe("RecordOpportunityGoNoGoDecisionUseCase", () => {
  it("records a GO decision and synchronizes Opportunity.status atomically", async () => {
    const { opportunityRepository, decisionRepository, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);

    const record = await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER", decision: "GO" });

    expect(record.decision).toBe("GO");
    const reloaded = await opportunityRepository.findById({ organizationId: ORG, opportunityId: opportunity.id.value });
    expect(reloaded?.status).toBe(OpportunityStatus.Go);
    expect((await decisionRepository.listByOpportunity({ organizationId: ORG, opportunityId: opportunity.id.value }))).toHaveLength(1);
  });

  it("refuses a NO_GO decision without a justification", async () => {
    const { opportunityRepository, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);

    await expect(useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER", decision: "NO_GO" })).rejects.toThrow(
      GoNoGoDecisionJustificationRequiredError,
    );
  });

  it("refuses a GO_CONDITIONAL decision without conditions", async () => {
    const { opportunityRepository, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);

    await expect(useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER", decision: "GO_CONDITIONAL" })).rejects.toThrow(
      GoNoGoDecisionConditionsRequiredError,
    );
  });

  it("accepts a NO_GO decision with a justification and moves the Opportunity to NO_GO", async () => {
    const { opportunityRepository, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);

    await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER", decision: "NO_GO", justification: "Capacité technique insuffisante." });

    const reloaded = await opportunityRepository.findById({ organizationId: ORG, opportunityId: opportunity.id.value });
    expect(reloaded?.status).toBe(OpportunityStatus.NoGo);
  });

  it("keeps every decision in history, never overwriting a previous one (append-only)", async () => {
    const { opportunityRepository, decisionRepository, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);

    await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER", decision: "NO_GO", justification: "Pas assez de références." });
    await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER", decision: "GO" });

    const history = await decisionRepository.listByOpportunity({ organizationId: ORG, opportunityId: opportunity.id.value });
    expect(history).toHaveLength(2);
    expect(history[0]?.decision).toBe("GO");
    expect(history[1]?.decision).toBe("NO_GO");
  });

  it("refuses when the actor lacks opportunity:record_decision (e.g. CONTRIBUTOR)", async () => {
    const { opportunityRepository, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);

    await expect(useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "CONTRIBUTOR", decision: "GO" })).rejects.toThrow(
      OpportunityPermissionMissingError,
    );
  });

  it("refuses a decision before the Opportunity has reached QUALIFIED (funnel discipline enforced by the aggregate)", async () => {
    const { opportunityRepository, useCase } = await buildHarness();
    const opportunity = Opportunity.create({
      id: OpportunityId.from("opportunity-2"),
      organizationId: ORG,
      clientAccountId: DEFAULT_TEST_CLIENT_ACCOUNT_ID,
      title: "Marché non qualifié",
      createdBy: "user-1",
      occurredAt: new Date("2026-01-01T00:00:00Z"),
    });
    await opportunityRepository.seed(opportunity);

    await expect(useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER", decision: "GO" })).rejects.toThrow(
      InvalidOpportunityStatusTransitionError,
    );
  });

  it("audit finding (round 1) — rolls back the Opportunity.status change if the decision write fails afterwards: never a status change without its recorded decision", async () => {
    const { opportunityRepository, decisionRepository, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);

    class IntentionalFailure extends Error {}
    decisionRepository.create = async () => {
      throw new IntentionalFailure("simulated failure after the status write already succeeded");
    };

    await expect(useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER", decision: "GO" })).rejects.toThrow(
      IntentionalFailure,
    );

    // La preuve : le statut n'est JAMAIS resté à GO malgré l'écriture initiale réussie — tout est
    // annulé ensemble (même motif que le test de rollback de PromoteOpportunityToTenderUseCase).
    const reloaded = await opportunityRepository.findById({ organizationId: ORG, opportunityId: opportunity.id.value });
    expect(reloaded?.status).toBe(OpportunityStatus.Qualified);
    const history = await decisionRepository.listByOpportunity({ organizationId: ORG, opportunityId: opportunity.id.value });
    expect(history).toHaveLength(0);
  });

  /**
   * Audit Codex round 2 (P1 confirmé) — la restriction "CLIENT_MANAGER uniquement" vit au palier
   * client (`resolveGoNoGoClientAccess`), jamais au palier organisation : "user-2" n'a AUCUNE
   * affectation sur le client de l'Opportunity (seul "user-1" est affecté par
   * `createClientPortfolioTestFixture`) et n'est ni OWNER ni ORGANIZATION_ADMIN — aucun filet de
   * secours administratif ne s'applique, il doit être rejeté même si son rôle organisation
   * (BID_MANAGER) a la permission au palier organisation.
   */
  it("refuses a BID_MANAGER without a real CLIENT_MANAGER assignment on the opportunity's client (no admin bypass for BID_MANAGER)", async () => {
    const { opportunityRepository, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);

    await expect(useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-2", actorRole: "BID_MANAGER", decision: "GO" })).rejects.toThrow(
      ClientAccountNotFoundError,
    );
  });

  it("refuses a CONTRIBUTOR without a real CLIENT_MANAGER assignment on the opportunity's client (no admin bypass for CONTRIBUTOR either)", async () => {
    const { opportunityRepository, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);

    await expect(useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-2", actorRole: "CONTRIBUTOR", decision: "GO" })).rejects.toThrow(
      OpportunityPermissionMissingError,
    );
  });

  it("refuses an OWNER without a real client assignment when no justification is provided (admin bypass always tracked)", async () => {
    const { opportunityRepository, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);

    await expect(useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-2", actorRole: "OWNER", decision: "GO" })).rejects.toThrow(
      GoNoGoAdminBypassJustificationRequiredError,
    );
  });

  it("lets an OWNER without a real client assignment decide with a justification, and records the bypass in the audit log", async () => {
    const { opportunityRepository, auditLogWriter, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);

    const record = await useCase.execute({
      organizationId: ORG,
      opportunityId: opportunity.id.value,
      actorId: "user-2",
      actorRole: "OWNER",
      decision: "GO",
      justification: "Client account manager on leave — approving under administrative privilege.",
    });

    expect(record.decision).toBe("GO");
    const bypassEntry = auditLogWriter.entries.find((entry) => entry.action === "opportunity.go_no_go_decision_recorded");
    expect(bypassEntry?.metadata).toEqual({ clientAssignmentBypass: true });
  });

  it("never marks the audit log as a bypass for the normal CLIENT_MANAGER-assigned path", async () => {
    const { opportunityRepository, auditLogWriter, useCase } = await buildHarness();
    const opportunity = qualifiedOpportunity();
    await opportunityRepository.seed(opportunity);

    await useCase.execute({ organizationId: ORG, opportunityId: opportunity.id.value, actorId: "user-1", actorRole: "BID_MANAGER", decision: "GO" });

    const entry = auditLogWriter.entries.find((entry) => entry.action === "opportunity.go_no_go_decision_recorded");
    expect(entry?.metadata).toBeUndefined();
  });
});
