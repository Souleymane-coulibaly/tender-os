import { describe, expect, it, vi } from "vitest";
import { DeliverableStatusRecalculationService } from "./deliverable-status-recalculation.service";
import type { DeliverableRepository } from "../ports/deliverable.repository";
import type { DeliverableRevisionRepository } from "../ports/deliverable-revision.repository";
import type { DeliverableSectionRepository } from "../ports/deliverable-section.repository";
import type { DeliverableAnnexRepository } from "../ports/deliverable-annex.repository";
import type { ChecklistPieceEntryRepository } from "../ports/checklist-piece-entry.repository";
import type { ComplianceMatrixEntryRepository } from "../ports/compliance-matrix-entry.repository";
import type { ExportJobRepository } from "../../../export";
import { ExportMode, ExportSectionSource } from "../../../export";
import { ExportFormat } from "../../../export/domain/export-format";
import { ExportSectionSelection, ExportSectionValidationStatus } from "../../../export/domain/export-section-selection";
import { Deliverable } from "../../domain/deliverable.aggregate";
import { DeliverableStatus } from "../../domain/deliverable-status";
import { DeliverableSection } from "../../domain/deliverable-section.aggregate";
import { DeliverableSectionStatus } from "../../domain/deliverable-section-status";
import { DeliverableType } from "../../domain/deliverable-type";
import { DeliverableAnnex } from "../../domain/deliverable-annex.aggregate";
import { AnnexStatus } from "../../domain/annex-status";
import { ChecklistPieceEntry } from "../../domain/checklist-piece-entry.aggregate";
import { ComplianceMatrixEntry } from "../../domain/compliance-matrix-entry.aggregate";
import { ComplianceCoverageStatus, Criticality } from "../../domain/compliance-coverage-status";
import { ChecklistPieceStatus } from "../../domain/checklist-piece-status";
import { ExportJob } from "../../../export/domain/export-job.aggregate";

const NOW = new Date("2026-09-06T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";

function fakeDeliverable(): Deliverable {
  return Deliverable.create({ id: "deliverable-1", organizationId: ORGANIZATION_ID, clientAccountId: "client-1", tenderId: "tender-1", type: DeliverableType.TechnicalMemo, createdBy: "user-1", occurredAt: NOW });
}

function fakeSection(id: string, status: DeliverableSectionStatus): DeliverableSection {
  const section = DeliverableSection.create({ id, organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1", code: id.toUpperCase(), title: id, order: 0, headingLevel: 1, mandatory: true, occurredAt: NOW });
  section.applyComputedStatus(status, NOW);
  return section;
}

function fakeCompletedFinalExportJob(input: { documentType: string; completedAt: Date }): ExportJob {
  const job = ExportJob.create({
    id: "export-1",
    organizationId: ORGANIZATION_ID,
    clientAccountId: "client-1",
    tenderId: "tender-1",
    exportTemplateId: "template-1",
    exportTemplateVersionId: "version-1",
    documentType: input.documentType,
    mode: ExportMode.Final,
    format: ExportFormat.Pdf,
    version: 1,
    basedOnExportJobId: "preview-1",
    sections: [fakeSectionSelection()],
    createdBy: "user-1",
    occurredAt: NOW,
  });
  job.markGenerating();
  job.markCompleted(input.completedAt);
  return job;
}

function fakeSectionSelection(): ExportSectionSelection {
  return ExportSectionSelection.create({
    sectionId: "section-1",
    sourceType: ExportSectionSource.Manual,
    manualContent: "content",
    validationStatus: ExportSectionValidationStatus.Validated,
    selectedBy: "user-1",
    selectedAt: NOW,
    order: 0,
  });
}

function fakeExportJobRepository(items: readonly ExportJob[] = []): ExportJobRepository {
  return { list: vi.fn(async () => ({ items: items.map((job) => ({ job })), total: items.length })) } as unknown as ExportJobRepository;
}

function buildService(input: {
  deliverable: Deliverable;
  sections: readonly DeliverableSection[];
  exportJobRepository: ExportJobRepository;
  annexes?: readonly DeliverableAnnex[];
  checklistEntries?: readonly ChecklistPieceEntry[];
  complianceEntries?: readonly ComplianceMatrixEntry[];
}) {
  const deliverableRepository = {
    findById: vi.fn(async () => input.deliverable),
    save: vi.fn(async () => undefined),
  } as unknown as DeliverableRepository;
  const sectionRepository = { listByDeliverable: vi.fn(async () => input.sections) } as unknown as DeliverableSectionRepository;
  const revisionRepository = {} as unknown as DeliverableRevisionRepository;
  const annexRepository = { listByDeliverable: vi.fn(async () => input.annexes ?? []) } as unknown as DeliverableAnnexRepository;
  const checklistRepository = { listByDeliverable: vi.fn(async () => input.checklistEntries ?? []) } as unknown as ChecklistPieceEntryRepository;
  const complianceRepository = { listByDeliverable: vi.fn(async () => input.complianceEntries ?? []) } as unknown as ComplianceMatrixEntryRepository;
  return new DeliverableStatusRecalculationService(
    deliverableRepository,
    sectionRepository,
    revisionRepository,
    input.exportJobRepository,
    annexRepository,
    checklistRepository,
    complianceRepository,
    { now: () => NOW },
  );
}

describe("DeliverableStatusRecalculationService (mission §15 — EXPORTED > APPROVED > sections)", () => {
  it("derives a section-based status when nothing is approved or exported", async () => {
    const deliverable = fakeDeliverable();
    const service = buildService({ deliverable, sections: [fakeSection("s1", DeliverableSectionStatus.Validated)], exportJobRepository: fakeExportJobRepository() });

    await service.recomputeDeliverable({ organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1" });

    expect(deliverable.status).toBe(DeliverableStatus.Validated);
  });

  it("APPROVED overrides the section-derived status once markApproved has been called", async () => {
    const deliverable = fakeDeliverable();
    deliverable.markApproved({ approvedBy: "user-1", occurredAt: NOW });
    const service = buildService({ deliverable, sections: [fakeSection("s1", DeliverableSectionStatus.Validated)], exportJobRepository: fakeExportJobRepository() });

    await service.recomputeDeliverable({ organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1" });

    expect(deliverable.status).toBe(DeliverableStatus.Approved);
  });

  it("EXPORTED overrides APPROVED once a FINAL export for this document type has COMPLETED", async () => {
    const deliverable = fakeDeliverable();
    deliverable.markApproved({ approvedBy: "user-1", occurredAt: NOW });
    const completedJob = fakeCompletedFinalExportJob({ documentType: DeliverableType.TechnicalMemo, completedAt: NOW });
    const service = buildService({ deliverable, sections: [fakeSection("s1", DeliverableSectionStatus.Validated)], exportJobRepository: fakeExportJobRepository([completedJob]) });

    await service.recomputeDeliverable({ organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1" });

    expect(deliverable.status).toBe(DeliverableStatus.Exported);
  });

  it("ignores a FINAL export job for a different document type", async () => {
    const deliverable = fakeDeliverable();
    deliverable.markApproved({ approvedBy: "user-1", occurredAt: NOW });
    const otherJob = fakeCompletedFinalExportJob({ documentType: DeliverableType.ExecutiveSummary, completedAt: NOW });
    const service = buildService({ deliverable, sections: [fakeSection("s1", DeliverableSectionStatus.Validated)], exportJobRepository: fakeExportJobRepository([otherJob]) });

    await service.recomputeDeliverable({ organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1" });

    expect(deliverable.status).toBe(DeliverableStatus.Approved);
  });

  it("ignores a PENDING/GENERATING export job (not yet COMPLETED)", async () => {
    const deliverable = fakeDeliverable();
    deliverable.markApproved({ approvedBy: "user-1", occurredAt: NOW });
    const pendingJob = ExportJob.create({
      id: "export-2",
      organizationId: ORGANIZATION_ID,
      clientAccountId: "client-1",
      tenderId: "tender-1",
      exportTemplateId: "template-1",
      exportTemplateVersionId: "version-1",
      documentType: DeliverableType.TechnicalMemo,
      mode: ExportMode.Final,
      format: ExportFormat.Pdf,
      version: 1,
      basedOnExportJobId: "preview-1",
      sections: [fakeSectionSelection()],
      createdBy: "user-1",
      occurredAt: NOW,
    });
    const service = buildService({ deliverable, sections: [fakeSection("s1", DeliverableSectionStatus.Validated)], exportJobRepository: fakeExportJobRepository([pendingJob]) });

    await service.recomputeDeliverable({ organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1" });

    expect(deliverable.status).toBe(DeliverableStatus.Approved);
  });

  it("excludes hidden sections from the derived status (mission §15)", async () => {
    const deliverable = fakeDeliverable();
    const visible = fakeSection("s1", DeliverableSectionStatus.Validated);
    const hidden = fakeSection("s2", DeliverableSectionStatus.NotStarted);
    hidden.hide(NOW);
    const service = buildService({ deliverable, sections: [visible, hidden], exportJobRepository: fakeExportJobRepository() });

    await service.recomputeDeliverable({ organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1" });

    expect(deliverable.status).toBe(DeliverableStatus.Validated);
  });
});

describe("DeliverableStatusRecalculationService.recomputeOverlayDeliverable — correctif 'le badge reste NOT_STARTED indéfiniment'", () => {
  it("derives an Annexes deliverable's status from its annexes' statuses", async () => {
    const deliverable = Deliverable.create({ id: "deliverable-1", organizationId: ORGANIZATION_ID, clientAccountId: "client-1", tenderId: "tender-1", type: DeliverableType.Annexes, createdBy: "user-1", occurredAt: NOW });
    const provided = DeliverableAnnex.create({ id: "annex-1", organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1", label: "CV", order: 0, createdBy: "user-1", occurredAt: NOW });
    provided.changeStatus(AnnexStatus.Validated);
    const pending = DeliverableAnnex.create({ id: "annex-2", organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1", label: "Certificat", order: 1, createdBy: "user-1", occurredAt: NOW });
    const service = buildService({ deliverable, sections: [], exportJobRepository: fakeExportJobRepository(), annexes: [provided, pending] });

    await service.recomputeOverlayDeliverable({ organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1" });

    expect(deliverable.status).toBe(DeliverableStatus.InProgress);
  });

  it("derives a Checklist deliverable's status from its pieces' statuses, CHANGES_REQUESTED winning over a mix of progress", async () => {
    const deliverable = Deliverable.create({ id: "deliverable-1", organizationId: ORGANIZATION_ID, clientAccountId: "client-1", tenderId: "tender-1", type: DeliverableType.Checklist, createdBy: "user-1", occurredAt: NOW });
    const provided = ChecklistPieceEntry.create({ id: "entry-1", organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1", name: "Attestation", mandatory: true, order: 0, createdBy: "user-1", occurredAt: NOW });
    provided.changeStatus({ status: ChecklistPieceStatus.Provided, occurredAt: NOW });
    const rejected = ChecklistPieceEntry.create({ id: "entry-2", organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1", name: "Assurance", mandatory: true, order: 1, createdBy: "user-1", occurredAt: NOW });
    rejected.changeStatus({ status: ChecklistPieceStatus.Rejected, occurredAt: NOW });
    const service = buildService({ deliverable, sections: [], exportJobRepository: fakeExportJobRepository(), checklistEntries: [provided, rejected] });

    await service.recomputeOverlayDeliverable({ organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1" });

    expect(deliverable.status).toBe(DeliverableStatus.ChangesRequested);
  });

  it("derives a ComplianceMatrix deliverable's status as READY_FOR_REVIEW once every entry has left TO_CONFIRM", async () => {
    const deliverable = Deliverable.create({ id: "deliverable-1", organizationId: ORGANIZATION_ID, clientAccountId: "client-1", tenderId: "tender-1", type: DeliverableType.ComplianceMatrix, createdBy: "user-1", occurredAt: NOW });
    const covered = ComplianceMatrixEntry.create({ id: "entry-1", organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1", source: "CCTP art. 3.2", mandatory: true, criticality: Criticality.High, order: 0, createdBy: "user-1", occurredAt: NOW });
    covered.update({ coverageStatus: ComplianceCoverageStatus.Covered, occurredAt: NOW });
    const notApplicable = ComplianceMatrixEntry.create({ id: "entry-2", organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1", source: "CCTP art. 4.1", mandatory: false, criticality: Criticality.Low, order: 1, createdBy: "user-1", occurredAt: NOW });
    notApplicable.update({ coverageStatus: ComplianceCoverageStatus.NotApplicable, occurredAt: NOW });
    const service = buildService({ deliverable, sections: [], exportJobRepository: fakeExportJobRepository(), complianceEntries: [covered, notApplicable] });

    await service.recomputeOverlayDeliverable({ organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1" });

    expect(deliverable.status).toBe(DeliverableStatus.ReadyForReview);
  });

  it("never touches a structured deliverable (TechnicalMemo) — recomputeOverlayDeliverable is reserved to the 3 overlay types", async () => {
    const deliverable = fakeDeliverable();
    const service = buildService({ deliverable, sections: [fakeSection("s1", DeliverableSectionStatus.NotStarted)], exportJobRepository: fakeExportJobRepository() });

    await service.recomputeOverlayDeliverable({ organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1" });

    expect(deliverable.status).toBe(DeliverableStatus.NotStarted);
  });
});
