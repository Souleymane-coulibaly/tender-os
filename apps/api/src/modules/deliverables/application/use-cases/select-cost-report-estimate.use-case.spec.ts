import { describe, expect, it, vi } from "vitest";
import { SelectCostReportEstimateUseCase } from "./select-cost-report-estimate.use-case";
import type { DeliverableRepository } from "../ports/deliverable.repository";
import type { DeliverableAccessService } from "../services/deliverable-access.service";
import { ClientPermission } from "../../../client-portfolio";
import type { GetPricingEstimateUseCase } from "../../../pricing";
import { Deliverable } from "../../domain/deliverable.aggregate";
import { DeliverableType } from "../../domain/deliverable-type";
import { CrossClientDeliverableContentError, DeliverableCostReportAlreadyFrozenError, UnsupportedReadOnlyDeliverableError } from "../../domain/errors";

const NOW = new Date("2026-09-06T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";

function fakeDeliverable(type: DeliverableType = DeliverableType.CostReport, tenderId = "tender-1"): Deliverable {
  return Deliverable.create({ id: "deliverable-1", organizationId: ORGANIZATION_ID, clientAccountId: "client-1", tenderId, type, createdBy: "user-1", occurredAt: NOW });
}

function fakeAccessService(deliverable: Deliverable): DeliverableAccessService {
  return { loadDeliverable: vi.fn(async () => ({ deliverable, clientAccountId: "client-1" })) } as unknown as DeliverableAccessService;
}

function fakeClock() {
  return { now: () => NOW };
}

const baseCommand = { organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", deliverableId: "deliverable-1", pricingEstimateId: "estimate-1", versionNumber: 1 };

describe("SelectCostReportEstimateUseCase (mission P1-002 — figement explicite d'une version Sprint 7)", () => {
  it("fige la référence pricing après avoir vérifié qu'elle existe et appartient au même Tender", async () => {
    const deliverable = fakeDeliverable();
    const accessService = fakeAccessService(deliverable);
    const deliverableRepository = { save: vi.fn(async () => undefined) } as unknown as DeliverableRepository;
    const getPricingEstimateUseCase = { execute: vi.fn(async () => ({ id: "estimate-1", tenderId: "tender-1", currentVersion: { version: 1 } })) } as unknown as GetPricingEstimateUseCase;
    const useCase = new SelectCostReportEstimateUseCase(accessService, deliverableRepository, getPricingEstimateUseCase, fakeClock());

    const summary = await useCase.execute(baseCommand);

    expect(accessService.loadDeliverable).toHaveBeenCalledWith(expect.objectContaining({ permission: ClientPermission.ManageDeliverable }));
    expect(getPricingEstimateUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ estimateId: "estimate-1", version: 1 }));
    expect(deliverable.costReportPricingEstimateId).toBe("estimate-1");
    expect(deliverable.costReportPricingEstimateVersionNumber).toBe(1);
    expect(deliverable.costReportSelectedBy).toBe("user-1");
    expect(deliverableRepository.save).toHaveBeenCalledWith(deliverable);
    expect(summary.costReportPricingEstimateId).toBe("estimate-1");
  });

  it("refuse une estimation appartenant à un AUTRE Tender", async () => {
    const deliverable = fakeDeliverable(DeliverableType.CostReport, "tender-1");
    const accessService = fakeAccessService(deliverable);
    const deliverableRepository = { save: vi.fn(async () => undefined) } as unknown as DeliverableRepository;
    const getPricingEstimateUseCase = { execute: vi.fn(async () => ({ id: "estimate-1", tenderId: "tender-OTHER", currentVersion: { version: 1 } })) } as unknown as GetPricingEstimateUseCase;
    const useCase = new SelectCostReportEstimateUseCase(accessService, deliverableRepository, getPricingEstimateUseCase, fakeClock());

    await expect(useCase.execute(baseCommand)).rejects.toBeInstanceOf(CrossClientDeliverableContentError);
    expect(deliverableRepository.save).not.toHaveBeenCalled();
  });

  it("refuse un livrable qui n'est pas un COST_REPORT", async () => {
    const deliverable = fakeDeliverable(DeliverableType.ComplianceMatrix);
    const accessService = fakeAccessService(deliverable);
    const deliverableRepository = { save: vi.fn(async () => undefined) } as unknown as DeliverableRepository;
    const getPricingEstimateUseCase = { execute: vi.fn() } as unknown as GetPricingEstimateUseCase;
    const useCase = new SelectCostReportEstimateUseCase(accessService, deliverableRepository, getPricingEstimateUseCase, fakeClock());

    await expect(useCase.execute(baseCommand)).rejects.toBeInstanceOf(UnsupportedReadOnlyDeliverableError);
    expect(getPricingEstimateUseCase.execute).not.toHaveBeenCalled();
  });

  it("refuse de remplacer une référence déjà figée par une autre (jamais un remplacement silencieux)", async () => {
    const deliverable = fakeDeliverable();
    deliverable.selectCostReportEstimate({ pricingEstimateId: "estimate-1", versionNumber: 1, selectedBy: "user-1", occurredAt: NOW });
    const accessService = fakeAccessService(deliverable);
    const deliverableRepository = { save: vi.fn(async () => undefined) } as unknown as DeliverableRepository;
    const getPricingEstimateUseCase = { execute: vi.fn(async () => ({ id: "estimate-2", tenderId: "tender-1", currentVersion: { version: 1 } })) } as unknown as GetPricingEstimateUseCase;
    const useCase = new SelectCostReportEstimateUseCase(accessService, deliverableRepository, getPricingEstimateUseCase, fakeClock());

    await expect(useCase.execute({ ...baseCommand, pricingEstimateId: "estimate-2" })).rejects.toBeInstanceOf(DeliverableCostReportAlreadyFrozenError);
    expect(deliverableRepository.save).not.toHaveBeenCalled();
  });
});
