import { describe, expect, it, vi } from "vitest";
import { DeliverableStatusRecalculationService } from "./deliverable-status-recalculation.service";
import type { DeliverableRepository } from "../ports/deliverable.repository";
import type { DeliverableRevisionRepository } from "../ports/deliverable-revision.repository";
import type { DeliverableSectionRepository } from "../ports/deliverable-section.repository";
import type { ExportJobRepository } from "../../../export";
import { ExportMode, ExportSectionSource } from "../../../export";
import { ExportFormat } from "../../../export/domain/export-format";
import { ExportSectionSelection, ExportSectionValidationStatus } from "../../../export/domain/export-section-selection";
import { Deliverable } from "../../domain/deliverable.aggregate";
import { DeliverableStatus } from "../../domain/deliverable-status";
import { DeliverableSection } from "../../domain/deliverable-section.aggregate";
import { DeliverableSectionStatus } from "../../domain/deliverable-section-status";
import { DeliverableType } from "../../domain/deliverable-type";
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

function buildService(input: { deliverable: Deliverable; sections: readonly DeliverableSection[]; exportJobRepository: ExportJobRepository }) {
  const deliverableRepository = {
    findById: vi.fn(async () => input.deliverable),
    save: vi.fn(async () => undefined),
  } as unknown as DeliverableRepository;
  const sectionRepository = { listByDeliverable: vi.fn(async () => input.sections) } as unknown as DeliverableSectionRepository;
  const revisionRepository = {} as unknown as DeliverableRevisionRepository;
  return new DeliverableStatusRecalculationService(deliverableRepository, sectionRepository, revisionRepository, input.exportJobRepository, { now: () => NOW });
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
