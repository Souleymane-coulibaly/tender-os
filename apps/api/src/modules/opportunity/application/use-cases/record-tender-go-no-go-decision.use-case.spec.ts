import { describe, expect, it, vi } from "vitest";
import type { ConsumeAoCreditUseCase } from "../../../billing";
import { GetCandidateCompanyUseCase } from "../../../candidate-company";
import { InMemoryCandidateCompanyRepository } from "../../../candidate-company/test-support/fakes";
import { ClientAccountNotFoundError } from "../../../client-portfolio";
import { CreateTenderUseCase, GetTenderUseCase, TenderPermissionMissingError } from "../../../tenders";
import { FakeAtomicTransactionRunner, InMemoryBuyerRepository, InMemoryTenderRepository, createClientPortfolioTestFixture, DEFAULT_TEST_CLIENT_ACCOUNT_ID } from "../../../tenders/test-support/fakes";
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

  const consumeAoCreditUseCase = { execute: vi.fn(async () => {}) } as unknown as ConsumeAoCreditUseCase;
  const createTenderUseCase = new CreateTenderUseCase(
    tenderRepository,
    buyerRepository,
    { record: async () => {} },
    clock,
    new SequentialIdGenerator(),
    outboxWriter,
    new FakeAtomicTransactionRunner(),
    clientPortfolio.getClientAccountUseCase,
    clientPortfolio.assertClientAccessUseCase,
    consumeAoCreditUseCase,
    new GetCandidateCompanyUseCase(new InMemoryCandidateCompanyRepository()),
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

  return { decisionRepository, reportRepository, auditLogWriter, useCase, tenderId: tender.id };
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

  // Checkpoint 2.1-P2.1-FIX-C (mission §16-18, TEST G8/G9) — un DCE modifié (ou toute nouvelle
  // analyse/rapport) ne réattribue JAMAIS silencieusement une décision humaine historique à un
  // nouveau rapport : `linkedReportId` reste figé sur le rapport EXACT contre lequel la décision a
  // réellement été prise, l'historique complet reste consultable.
  describe("Human decision preservation across a report refresh (Checkpoint 2.1-P2.1-FIX-C)", () => {
    function minimalResult() {
      return {
        globalScore: 50,
        confidence: 0.5,
        complexity: 3,
        documentaryLoad: "MEDIUM",
        estimatedPrepTime: {} as never,
        categoryScores: {} as never,
        positiveCauses: [],
        negativeCauses: [],
        risks: [],
        blockers: [],
        missingInfo: [],
        subcontractingFlags: [],
        recommendation: "GO",
        recommendationRationale: "Dossier complet.",
      } as const;
    }

    it("BLOQUANT (TEST G8/G9) — a historical GO decision stays linked to its original report even after a newer report (post-DCE-change) is generated, never silently reattributed", async () => {
      const { decisionRepository, reportRepository, useCase, tenderId } = await buildHarness();

      const reportG1 = await reportRepository.create({
        id: "report-g1",
        organizationId: ORG,
        tenderId,
        reportVersion: 1,
        analysisVersion: 1,
        dceRevision: 1,
        calculationVersion: "1.0.0",
        generatedAt: new Date("2026-01-01T00:00:00Z"),
        result: minimalResult(),
      });

      const decisionOnG1 = await useCase.execute({ organizationId: ORG, tenderId, actorId: "user-1", actorRole: "BID_MANAGER", decision: "GO", linkedReportId: reportG1.id });
      expect(decisionOnG1.linkedReportId).toBe(reportG1.id);

      // Le DCE change (RC-v2, simulé) : un nouveau rapport G2 est généré.
      const reportG2 = await reportRepository.create({
        id: "report-g2",
        organizationId: ORG,
        tenderId,
        reportVersion: 2,
        analysisVersion: 2,
        dceRevision: 2,
        calculationVersion: "1.0.0",
        generatedAt: new Date("2026-01-02T00:00:00Z"),
        result: minimalResult(),
      });

      // BLOQUANT — la décision historique D1 n'est jamais réécrite/réattribuée à G2.
      const historyAfterRefresh = await decisionRepository.listByTender({ organizationId: ORG, tenderId });
      const persistedD1 = historyAfterRefresh.find((d) => d.id === decisionOnG1.id);
      expect(persistedD1?.linkedReportId).toBe(reportG1.id);

      // Une NOUVELLE décision humaine, explicitement liée à G2, coexiste — jamais un remplacement.
      const decisionOnG2 = await useCase.execute({ organizationId: ORG, tenderId, actorId: "user-1", actorRole: "BID_MANAGER", decision: "NO_GO", justification: "RC-v2 ajoute une contrainte bloquante.", linkedReportId: reportG2.id });
      expect(decisionOnG2.linkedReportId).toBe(reportG2.id);

      const fullHistory = await decisionRepository.listByTender({ organizationId: ORG, tenderId });
      expect(fullHistory).toHaveLength(2);
      expect(fullHistory.find((d) => d.id === decisionOnG1.id)?.linkedReportId).toBe(reportG1.id);
      expect(fullHistory.find((d) => d.id === decisionOnG2.id)?.linkedReportId).toBe(reportG2.id);
      expect(fullHistory.find((d) => d.id === decisionOnG1.id)?.decision).toBe("GO");
    });
  });
});
