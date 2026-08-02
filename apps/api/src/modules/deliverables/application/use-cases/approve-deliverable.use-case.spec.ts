import { describe, expect, it, vi } from "vitest";
import { ApproveDeliverableUseCase } from "./approve-deliverable.use-case";
import type { DeliverableRepository } from "../ports/deliverable.repository";
import type { DeliverableSectionRepository } from "../ports/deliverable-section.repository";
import type { DeliverableAccessService } from "../services/deliverable-access.service";
import type { DeliverableStatusRecalculationService } from "../services/deliverable-status-recalculation.service";
import { ClientPermission } from "../../../client-portfolio";
import { Deliverable } from "../../domain/deliverable.aggregate";
import { DeliverableSection } from "../../domain/deliverable-section.aggregate";
import { DeliverableSectionStatus } from "../../domain/deliverable-section-status";
import { DeliverableType } from "../../domain/deliverable-type";
import { DeliverableNotReadyForApprovalError, UnsupportedReadOnlyDeliverableError } from "../../domain/errors";

const NOW = new Date("2026-09-05T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";

function fakeDeliverable(type: DeliverableType = DeliverableType.TechnicalMemo): Deliverable {
  return Deliverable.create({ id: "deliverable-1", organizationId: ORGANIZATION_ID, clientAccountId: "client-1", tenderId: "tender-1", type, createdBy: "user-1", occurredAt: NOW });
}

function fakeSection(id: string, status: DeliverableSectionStatus, options: { hidden?: boolean } = {}): DeliverableSection {
  const section = DeliverableSection.create({
    id,
    organizationId: ORGANIZATION_ID,
    deliverableId: "deliverable-1",
    code: id.toUpperCase(),
    title: id,
    order: 0,
    headingLevel: 1,
    mandatory: true,
    hidden: options.hidden,
    occurredAt: NOW,
  });
  section.applyComputedStatus(status, NOW);
  return section;
}

function fakeAccessService(deliverable: Deliverable): DeliverableAccessService {
  return { loadDeliverable: vi.fn(async () => ({ deliverable, clientAccountId: "client-1" })) } as unknown as DeliverableAccessService;
}

function fakeClock() {
  return { now: () => NOW };
}

const baseCommand = { organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", deliverableId: "deliverable-1" };

describe("ApproveDeliverableUseCase (mission §15 — APPROVED est un fait explicite)", () => {
  it("approves a deliverable once every visible section is VALIDATED", async () => {
    const deliverable = fakeDeliverable();
    const accessService = fakeAccessService(deliverable);
    const sectionRepository = {
      listByDeliverable: vi.fn(async () => [fakeSection("s1", DeliverableSectionStatus.Validated), fakeSection("s2", DeliverableSectionStatus.Validated, { hidden: true })]),
    } as unknown as DeliverableSectionRepository;
    const deliverableRepository = { save: vi.fn(async () => undefined), findById: vi.fn(async () => deliverable) } as unknown as DeliverableRepository;
    const statusRecalculation = { recomputeDeliverable: vi.fn(async () => undefined) } as unknown as DeliverableStatusRecalculationService;
    const useCase = new ApproveDeliverableUseCase(accessService, deliverableRepository, sectionRepository, statusRecalculation, fakeClock());

    const summary = await useCase.execute(baseCommand);

    expect(accessService.loadDeliverable).toHaveBeenCalledWith(expect.objectContaining({ permission: ClientPermission.ValidateDeliverable }));
    expect(deliverable.approvedBy).toBe("user-1");
    expect(deliverable.approvedAt).toEqual(NOW);
    expect(deliverableRepository.save).toHaveBeenCalledWith(deliverable);
    expect(statusRecalculation.recomputeDeliverable).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, deliverableId: "deliverable-1" });
    expect(summary.approvedBy).toBe("user-1");
  });

  it("ignores a hidden section's status when checking readiness (mission §15)", async () => {
    const deliverable = fakeDeliverable();
    const accessService = fakeAccessService(deliverable);
    const sectionRepository = {
      listByDeliverable: vi.fn(async () => [fakeSection("s1", DeliverableSectionStatus.Validated), fakeSection("s2", DeliverableSectionStatus.NotStarted, { hidden: true })]),
    } as unknown as DeliverableSectionRepository;
    const deliverableRepository = { save: vi.fn(async () => undefined), findById: vi.fn(async () => deliverable) } as unknown as DeliverableRepository;
    const statusRecalculation = { recomputeDeliverable: vi.fn(async () => undefined) } as unknown as DeliverableStatusRecalculationService;
    const useCase = new ApproveDeliverableUseCase(accessService, deliverableRepository, sectionRepository, statusRecalculation, fakeClock());

    await expect(useCase.execute(baseCommand)).resolves.toBeDefined();
  });

  it("refuses approval when a visible section is not yet VALIDATED", async () => {
    const deliverable = fakeDeliverable();
    const accessService = fakeAccessService(deliverable);
    const sectionRepository = {
      listByDeliverable: vi.fn(async () => [fakeSection("s1", DeliverableSectionStatus.Validated), fakeSection("s2", DeliverableSectionStatus.ReadyForReview)]),
    } as unknown as DeliverableSectionRepository;
    const deliverableRepository = { save: vi.fn(async () => undefined), findById: vi.fn(async () => deliverable) } as unknown as DeliverableRepository;
    const statusRecalculation = { recomputeDeliverable: vi.fn(async () => undefined) } as unknown as DeliverableStatusRecalculationService;
    const useCase = new ApproveDeliverableUseCase(accessService, deliverableRepository, sectionRepository, statusRecalculation, fakeClock());

    await expect(useCase.execute(baseCommand)).rejects.toBeInstanceOf(DeliverableNotReadyForApprovalError);
    expect(deliverableRepository.save).not.toHaveBeenCalled();
  });

  it("refuses approval when there are no sections at all", async () => {
    const deliverable = fakeDeliverable();
    const accessService = fakeAccessService(deliverable);
    const sectionRepository = { listByDeliverable: vi.fn(async () => []) } as unknown as DeliverableSectionRepository;
    const deliverableRepository = { save: vi.fn(async () => undefined), findById: vi.fn(async () => deliverable) } as unknown as DeliverableRepository;
    const statusRecalculation = { recomputeDeliverable: vi.fn(async () => undefined) } as unknown as DeliverableStatusRecalculationService;
    const useCase = new ApproveDeliverableUseCase(accessService, deliverableRepository, sectionRepository, statusRecalculation, fakeClock());

    await expect(useCase.execute(baseCommand)).rejects.toBeInstanceOf(DeliverableNotReadyForApprovalError);
  });

  it("refuses approval for a non-structured deliverable (e.g. compliance matrix)", async () => {
    const deliverable = fakeDeliverable(DeliverableType.ComplianceMatrix);
    const accessService = fakeAccessService(deliverable);
    const sectionRepository = { listByDeliverable: vi.fn(async () => []) } as unknown as DeliverableSectionRepository;
    const deliverableRepository = { save: vi.fn(async () => undefined), findById: vi.fn(async () => deliverable) } as unknown as DeliverableRepository;
    const statusRecalculation = { recomputeDeliverable: vi.fn(async () => undefined) } as unknown as DeliverableStatusRecalculationService;
    const useCase = new ApproveDeliverableUseCase(accessService, deliverableRepository, sectionRepository, statusRecalculation, fakeClock());

    await expect(useCase.execute(baseCommand)).rejects.toBeInstanceOf(UnsupportedReadOnlyDeliverableError);
    expect(sectionRepository.listByDeliverable).not.toHaveBeenCalled();
  });
});
