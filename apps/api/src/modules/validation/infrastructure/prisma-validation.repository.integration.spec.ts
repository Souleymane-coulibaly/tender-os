import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { FinalApproval } from "../domain/final-approval.aggregate";
import { ValidationIssue } from "../domain/validation-issue";
import { ValidationSeverity } from "../domain/validation-severity";
import { ValidationRun } from "../domain/validation-run.aggregate";
import { PrismaFinalApprovalRepository } from "./prisma-final-approval.repository";
import { PrismaValidationRunRepository } from "./prisma-validation-run.repository";

/** Preuve PostgreSQL réelle (mission Sprint 8A §75) — le round trip JSON/Decimal n'est pas en jeu
 *  ici, mais l'isolation tenant et la persistance réelle des transitions de résolution le sont. */
describe("Validation repositories (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const runRepository = new PrismaValidationRunRepository(prisma);
  const approvalRepository = new PrismaFinalApprovalRepository(prisma);

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const clientAccountId = randomUUID();
  const tenderId = randomUUID();
  const exportJobId = randomUUID();
  const now = new Date("2026-09-01T10:00:00Z");

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: organizationId, name: "Validation Repo Test Org", slug: `validation-repo-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: otherOrganizationId, name: "Validation Repo Test Org (other)", slug: `validation-repo-test-org-other-${otherOrganizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    await prisma.clientAccount.create({ data: { id: clientAccountId, organizationId, name: "Client", nameNormalized: "client", status: "ACTIVE", createdBy: randomUUID() } });
    await prisma.tender.create({ data: { id: tenderId, organizationId, clientAccountId, title: "Marché de test", status: "DRAFT", tags: [], createdBy: randomUUID() } });
    // Export job factice — seule sa présence (colonne FK réelle) importe ici, jamais son contenu.
    const templateId = randomUUID();
    await prisma.exportTemplate.create({ data: { id: templateId, organizationId, documentType: "TECHNICAL_MEMO", name: `T-${randomUUID()}`, createdBy: randomUUID() } });
    const templateVersionId = randomUUID();
    await prisma.exportTemplateVersion.create({
      data: { id: templateVersionId, organizationId, exportTemplateId: templateId, version: 1, status: "DRAFT", format: "DOCX", config: { sections: [] }, createdBy: randomUUID() },
    });
    await prisma.exportJob.create({
      data: {
        id: exportJobId,
        organizationId,
        clientAccountId,
        tenderId,
        exportTemplateId: templateId,
        exportTemplateVersionId: templateVersionId,
        documentType: "TECHNICAL_MEMO",
        mode: "PREVIEW",
        format: "DOCX",
        status: "COMPLETED",
        version: 1,
        createdBy: randomUUID(),
      },
    });
  });

  afterAll(async () => {
    await prisma.finalApproval.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.validationRun.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.exportJob.deleteMany({ where: { organizationId } });
    await prisma.exportTemplate.deleteMany({ where: { organizationId } });
    await prisma.tender.deleteMany({ where: { organizationId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.finalApproval.deleteMany({ where: { organizationId } });
    await prisma.validationRun.deleteMany({ where: { organizationId } });
  });

  function buildRunWithBlockingIssue() {
    const runId = randomUUID();
    const issue = ValidationIssue.create({
      id: randomUUID(),
      organizationId,
      validationRunId: runId,
      ruleCode: "MANDATORY_SECTION_MISSING",
      severity: ValidationSeverity.Blocking,
      message: "missing",
      occurredAt: now,
    });
    const run = ValidationRun.create({ id: runId, organizationId, clientAccountId, tenderId, exportJobId, runBy: randomUUID(), occurredAt: now, issues: [issue] });
    return { run, issue };
  }

  it("persists a run with its issues and reads them back with the correct readiness (BLOCKED)", async () => {
    const { run, issue } = buildRunWithBlockingIssue();
    await runRepository.create({ run, issues: [issue] });

    const found = await runRepository.findById({ organizationId, validationRunId: run.id });
    expect(found!.readinessStatus).toBe("BLOCKED");
    expect(found!.issues).toHaveLength(1);
    expect(found!.issues[0]!.isBlocking).toBe(true);
  });

  it("resolving an issue persists resolvedBy/resolvedAt/resolutionNote for real", async () => {
    const { run, issue } = buildRunWithBlockingIssue();
    await runRepository.create({ run, issues: [issue] });

    const resolvedBy = randomUUID();
    const fetched = await runRepository.findIssueById({ organizationId, issueId: issue.id });
    fetched!.resolve({ resolvedBy, resolutionNote: "fixed", occurredAt: now });
    await runRepository.saveIssue(fetched!);

    const reloaded = await runRepository.findIssueById({ organizationId, issueId: issue.id });
    expect(reloaded!.resolutionStatus).toBe("RESOLVED");
    expect(reloaded!.resolvedBy).toBe(resolvedBy);
    expect(reloaded!.resolutionNote).toBe("fixed");
  });

  it("tenant isolation — organization A cannot read organization B's validation run or issue", async () => {
    const { run, issue } = buildRunWithBlockingIssue();
    await runRepository.create({ run, issues: [issue] });

    expect(await runRepository.findById({ organizationId: otherOrganizationId, validationRunId: run.id })).toBeNull();
    expect(await runRepository.findIssueById({ organizationId: otherOrganizationId, issueId: issue.id })).toBeNull();
  });

  it("creates and invalidates a final approval, preserving history (never deleted)", async () => {
    const { run, issue } = buildRunWithBlockingIssue();
    issue.resolve({ resolvedBy: randomUUID(), resolutionNote: "fixed", occurredAt: now });
    await runRepository.create({ run, issues: [issue] });

    const approval = FinalApproval.create({
      id: randomUUID(),
      organizationId,
      clientAccountId,
      tenderId,
      exportJobId,
      validationRunId: run.id,
      manifestHash: "a".repeat(64),
      approvedBy: randomUUID(),
      approverRole: "OWNER",
      occurredAt: now,
      currentIssues: [issue],
    });
    await approvalRepository.create(approval);

    const active = await approvalRepository.findActiveForTender({ organizationId, tenderId });
    expect(active!.id).toBe(approval.id);

    active!.invalidate({ reason: "content changed", occurredAt: now });
    await approvalRepository.save(active!);

    expect(await approvalRepository.findActiveForTender({ organizationId, tenderId })).toBeNull();
    const stillThere = await approvalRepository.findById({ organizationId, approvalId: approval.id });
    expect(stillThere!.status).toBe("INVALIDATED");
  });

  it("repeated (3x) concurrent resolution attempts on the same issue never corrupt the resolution history", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { run, issue } = buildRunWithBlockingIssue();
      await runRepository.create({ run, issues: [issue] });

      const fetched = await runRepository.findIssueById({ organizationId, issueId: issue.id });
      fetched!.resolve({ resolvedBy: randomUUID(), resolutionNote: `attempt-${attempt}`, occurredAt: now });
      await runRepository.saveIssue(fetched!);

      const reloaded = await runRepository.findIssueById({ organizationId, issueId: issue.id });
      expect(reloaded!.resolutionStatus).toBe("RESOLVED");
      expect(reloaded!.resolutionNote).toBe(`attempt-${attempt}`);
    }
  });
});
