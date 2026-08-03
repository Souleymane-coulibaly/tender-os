import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AssertClientAccessUseCase } from "../../../client-portfolio";
import { DceNotFoundError, type GetDceUseCase, type ListDceDocumentsUseCase } from "../../../dce";
import { TenderBusinessAnalysisNotFoundError, type GetTenderBusinessAnalysisUseCase } from "../../../analysis";
import type { ListTenderDocumentsUseCase } from "../../../documents";
import type { GetTenderCostSummaryUseCase } from "../../../pricing";
import { DeliverableStatus, type ListDeliverablesUseCase } from "../../../deliverables";
import { ExportStatus, type ListExportHistoryUseCase } from "../../../export";
import { ReadinessStatus, type GetReadinessStatusUseCase } from "../../../validation";
import type { ListSignatureRequirementsUseCase } from "../../../signature";
import type { ListSubmissionPackagesUseCase } from "../../../submission-package";
import type { GetTenderUseCase } from "../../../tenders";
import { CockpitModuleKey, CockpitModuleStatus, CockpitNextAction, CockpitStep } from "../dtos";
import { GetTenderCockpitUseCase } from "./get-tender-cockpit.use-case";

function buildUseCase(
  overrides: Partial<{
    dceExists: boolean;
    dceDocumentCount: number;
    documentCount: number;
    analysisExists: boolean;
    activeEstimate: boolean;
    deliverableStatuses: string[];
    exportCount: number;
    readiness: { status: string; latestValidationRunId?: string; activeApprovalId?: string };
    mandatoryRequirements: number;
    packageCount: number;
  }> = {},
) {
  const organizationId = randomUUID();
  const clientAccountId = randomUUID();
  const tenderId = randomUUID();

  const getTenderUseCase: Pick<GetTenderUseCase, "execute"> = { execute: vi.fn(async () => ({ clientAccountId }) as never) };
  const assertClientAccessUseCase: Pick<AssertClientAccessUseCase, "execute"> = { execute: vi.fn(async () => undefined) };

  const getDceUseCase: Pick<GetDceUseCase, "execute"> = {
    execute: vi.fn(async () => {
      if (overrides.dceExists === false || overrides.dceExists === undefined) throw new DceNotFoundError();
      return {} as never;
    }),
  };
  const listDceDocumentsUseCase: Pick<ListDceDocumentsUseCase, "execute"> = {
    execute: vi.fn(async () => Array.from({ length: overrides.dceDocumentCount ?? 0 }, () => ({}) as never)),
  };
  const listTenderDocumentsUseCase: Pick<ListTenderDocumentsUseCase, "execute"> = {
    execute: vi.fn(async () => Array.from({ length: overrides.documentCount ?? 0 }, () => ({}) as never)),
  };
  const getTenderBusinessAnalysisUseCase: Pick<GetTenderBusinessAnalysisUseCase, "execute"> = {
    execute: vi.fn(async () => {
      if (!overrides.analysisExists) throw new TenderBusinessAnalysisNotFoundError();
      return {} as never;
    }),
  };
  const getTenderCostSummaryUseCase: Pick<GetTenderCostSummaryUseCase, "execute"> = {
    execute: vi.fn(async () => ({ activeEstimate: overrides.activeEstimate ? {} : undefined }) as never),
  };
  const listDeliverablesUseCase: Pick<ListDeliverablesUseCase, "execute"> = {
    execute: vi.fn(async () => (overrides.deliverableStatuses ?? Array(9).fill(DeliverableStatus.NotStarted)).map((status) => ({ status }) as never)),
  };
  const listExportHistoryUseCase: Pick<ListExportHistoryUseCase, "execute"> = {
    execute: vi.fn(async () => ({
      items: overrides.exportCount ? [{ status: ExportStatus.Completed } as never] : [],
      total: overrides.exportCount ?? 0,
    })),
  };
  const getReadinessStatusUseCase: Pick<GetReadinessStatusUseCase, "execute"> = {
    execute: vi.fn(async () => (overrides.readiness ?? { status: ReadinessStatus.NotReady }) as never),
  };
  const listSignatureRequirementsUseCase: Pick<ListSignatureRequirementsUseCase, "execute"> = {
    execute: vi.fn(async () => Array.from({ length: overrides.mandatoryRequirements ?? 0 }, () => ({ mandatory: true }) as never)),
  };
  const listSubmissionPackagesUseCase: Pick<ListSubmissionPackagesUseCase, "execute"> = {
    execute: vi.fn(async () => Array.from({ length: overrides.packageCount ?? 0 }, () => ({}) as never)),
  };

  const useCase = new GetTenderCockpitUseCase(
    getTenderUseCase as GetTenderUseCase,
    assertClientAccessUseCase as AssertClientAccessUseCase,
    getDceUseCase as GetDceUseCase,
    listDceDocumentsUseCase as ListDceDocumentsUseCase,
    listTenderDocumentsUseCase as ListTenderDocumentsUseCase,
    getTenderBusinessAnalysisUseCase as GetTenderBusinessAnalysisUseCase,
    getTenderCostSummaryUseCase as GetTenderCostSummaryUseCase,
    listDeliverablesUseCase as ListDeliverablesUseCase,
    listExportHistoryUseCase as ListExportHistoryUseCase,
    getReadinessStatusUseCase as GetReadinessStatusUseCase,
    listSignatureRequirementsUseCase as ListSignatureRequirementsUseCase,
    listSubmissionPackagesUseCase as ListSubmissionPackagesUseCase,
  );

  return { useCase, organizationId, tenderId };
}

function moduleStatus(modules: { key: string; status: string }[], key: string): string | undefined {
  return modules.find((m) => m.key === key)?.status;
}

describe("GetTenderCockpitUseCase", () => {
  it("reports DISCOVERY with INITIALIZE_DCE for a brand-new Tender (nothing started anywhere)", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({});
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(result.currentStep).toBe(CockpitStep.Discovery);
    expect(result.nextAction).toBe(CockpitNextAction.InitializeDce);
    expect(moduleStatus(result.modules as never, CockpitModuleKey.Dce)).toBe(CockpitModuleStatus.NotStarted);
  });

  it("reports IMPORT_DOCUMENTS once a DCE exists but has no documents yet", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({ dceExists: true, dceDocumentCount: 0 });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(result.nextAction).toBe(CockpitNextAction.ImportDocuments);
    expect(moduleStatus(result.modules as never, CockpitModuleKey.Dce)).toBe(CockpitModuleStatus.InProgress);
  });

  it("moves to the ANALYSIS step once documents exist but no business analysis has ever run", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({ dceExists: true, dceDocumentCount: 2, analysisExists: false });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(result.currentStep).toBe(CockpitStep.Analysis);
    expect(result.nextAction).toBe(CockpitNextAction.RunAnalysis);
  });

  it("moves to PREPARATION and asks to complete deliverables once discovery+analysis are done but deliverables aren't validated", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({
      dceExists: true,
      dceDocumentCount: 2,
      analysisExists: true,
      deliverableStatuses: Array(9).fill(DeliverableStatus.NotStarted),
    });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(result.currentStep).toBe(CockpitStep.Preparation);
    expect(result.nextAction).toBe(CockpitNextAction.CompleteDeliverables);
  });

  it("flags a BLOCKED deliverable as ATTENTION on the Deliverables module, never silently averaged away", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({
      dceExists: true,
      dceDocumentCount: 2,
      analysisExists: true,
      deliverableStatuses: [DeliverableStatus.Blocked, ...Array(8).fill(DeliverableStatus.Validated)],
    });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(moduleStatus(result.modules as never, CockpitModuleKey.Deliverables)).toBe(CockpitModuleStatus.Attention);
    expect(result.alerts.some((a) => a.code === "DELIVERABLE_BLOCKED" && a.level === "BLOCKER")).toBe(true);
  });

  it("once all 9 deliverables are validated, asks to create a pricing estimate before exporting", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({
      dceExists: true,
      dceDocumentCount: 2,
      analysisExists: true,
      deliverableStatuses: Array(9).fill(DeliverableStatus.Validated),
      activeEstimate: false,
    });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(result.nextAction).toBe(CockpitNextAction.CreatePricingEstimate);
  });

  it("once deliverables and pricing are done, asks for a preview export before validation", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({
      dceExists: true,
      dceDocumentCount: 2,
      analysisExists: true,
      deliverableStatuses: Array(9).fill(DeliverableStatus.Validated),
      activeEstimate: true,
      exportCount: 0,
    });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(result.nextAction).toBe(CockpitNextAction.PreviewExport);
  });

  it("moves to VALIDATION and asks to approve once a run exists with no blocking issues", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({
      dceExists: true,
      dceDocumentCount: 2,
      analysisExists: true,
      deliverableStatuses: Array(9).fill(DeliverableStatus.Validated),
      activeEstimate: true,
      exportCount: 1,
      readiness: { status: ReadinessStatus.ReadyForApproval, latestValidationRunId: "run-1" },
    });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(result.currentStep).toBe(CockpitStep.Validation);
    expect(result.nextAction).toBe(CockpitNextAction.ApproveFinalVersion);
  });

  it("asks to resolve blocking issues instead of approving when the run is BLOCKED, and raises a BLOCKER alert", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({
      readiness: { status: ReadinessStatus.Blocked, latestValidationRunId: "run-1" },
    });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(result.nextAction).toBe(CockpitNextAction.ResolveBlockingIssues);
    expect(result.alerts.some((a) => a.code === "VALIDATION_OR_SIGNATURE_BLOCKED")).toBe(true);
  });

  it("mission Sprint 8A.2 (correction bug #5) — the Signature module is NOT_APPLICABLE when no mandatory requirement was ever detected, never a fabricated blocker", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({
      readiness: { status: ReadinessStatus.Approved, activeApprovalId: "approval-1" },
      mandatoryRequirements: 0,
    });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(moduleStatus(result.modules as never, CockpitModuleKey.Signature)).toBe(CockpitModuleStatus.NotApplicable);
    expect(result.currentStep).toBe(CockpitStep.Submission);
    expect(result.nextAction).toBe(CockpitNextAction.CreatePackage);
  });

  it("derives the Signature module status directly from ReadinessStatus, never a second computation — IN_PROGRESS while signing", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({
      readiness: { status: ReadinessStatus.SignatureInProgress, activeApprovalId: "approval-1" },
      mandatoryRequirements: 1,
    });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(moduleStatus(result.modules as never, CockpitModuleKey.Signature)).toBe(CockpitModuleStatus.InProgress);
    expect(result.currentStep).toBe(CockpitStep.Signature);
    expect(result.nextAction).toBe(CockpitNextAction.FollowSignature);
  });

  it("reaches SUBMISSION once signature is fully verified (READY_FOR_SUBMISSION)", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({
      readiness: { status: ReadinessStatus.ReadyForSubmission, activeApprovalId: "approval-1" },
      mandatoryRequirements: 1,
    });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(moduleStatus(result.modules as never, CockpitModuleKey.Signature)).toBe(CockpitModuleStatus.Done);
    expect(result.currentStep).toBe(CockpitStep.Submission);
    expect(result.nextAction).toBe(CockpitNextAction.CreatePackage);
  });

  it("reports DONE once a submission package has actually been created", async () => {
    const { useCase, organizationId, tenderId } = buildUseCase({
      readiness: { status: ReadinessStatus.ReadyForSubmission, activeApprovalId: "approval-1" },
      mandatoryRequirements: 1,
      packageCount: 1,
    });
    const result = await useCase.execute({ organizationId, actorId: randomUUID(), actorRole: "OWNER", tenderId });
    expect(result.currentStep).toBe(CockpitStep.Done);
    expect(result.nextAction).toBe(CockpitNextAction.None);
    expect(moduleStatus(result.modules as never, CockpitModuleKey.Package)).toBe(CockpitModuleStatus.Done);
  });
});
