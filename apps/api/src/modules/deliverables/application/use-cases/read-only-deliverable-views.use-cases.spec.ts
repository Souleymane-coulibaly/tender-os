import { describe, expect, it, vi } from "vitest";
import {
  GetDeliverableCostReportUseCase,
  GetDeliverableSignatureDocumentsUseCase,
  GetDeliverableSubmissionPackageUseCase,
  GetDeliverableValidationReportUseCase,
} from "./read-only-deliverable-views.use-cases";
import type { DeliverableRepository } from "../ports/deliverable.repository";
import { Deliverable } from "../../domain/deliverable.aggregate";
import { DeliverableType } from "../../domain/deliverable-type";
import { UnsupportedReadOnlyDeliverableError } from "../../domain/errors";
import type { GetPricingEstimateUseCase, ListPricingEstimatesUseCase } from "../../../pricing";
import type { ListSignatureRequirementsUseCase, ListSignatureTransactionsUseCase } from "../../../signature";
import type { ListSubmissionPackagesUseCase } from "../../../submission-package";
import type { GetReadinessStatusUseCase, GetValidationRunUseCase } from "../../../validation";

const NOW = new Date("2026-09-02T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function deliverable(type: DeliverableType): Deliverable {
  return Deliverable.create({ id: "deliverable-1", organizationId: ORGANIZATION_ID, clientAccountId: "client-1", tenderId: TENDER_ID, type, createdBy: "user-1", occurredAt: NOW });
}

function fakeDeliverableRepository(d: Deliverable): DeliverableRepository {
  return {
    create: async () => undefined,
    findById: async ({ deliverableId }) => (deliverableId === d.id ? d : null),
    findByTenderAndType: async () => null,
    listByTender: async () => [],
    save: async () => undefined,
  };
}

const query = { organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", deliverableId: "deliverable-1" };

describe("GetDeliverableValidationReportUseCase (mission §14)", () => {
  it("delegates entirely to GetReadinessStatusUseCase/GetValidationRunUseCase, scoped by the deliverable's tenderId", async () => {
    const getReadinessStatusUseCase = { execute: vi.fn(async () => ({ status: "APPROVED", activeApprovalId: "approval-1" })) } as unknown as GetReadinessStatusUseCase;
    const getValidationRunUseCase = { execute: vi.fn(async () => ({ id: "run-1", readinessStatus: "APPROVED" })) } as unknown as GetValidationRunUseCase;
    const useCase = new GetDeliverableValidationReportUseCase(fakeDeliverableRepository(deliverable(DeliverableType.ValidationReport)), getReadinessStatusUseCase, getValidationRunUseCase);

    const result = await useCase.execute(query);

    expect(getReadinessStatusUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ tenderId: TENDER_ID }));
    expect(getValidationRunUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ tenderId: TENDER_ID }));
    expect(result.readiness.status).toBe("APPROVED");
    expect(result.latestRun?.id).toBe("run-1");
  });

  it("tolerates no validation run yet (never a hard failure just because nothing was run)", async () => {
    const getReadinessStatusUseCase = { execute: vi.fn(async () => ({ status: "NOT_READY" })) } as unknown as GetReadinessStatusUseCase;
    const getValidationRunUseCase = { execute: vi.fn(async () => { throw new Error("no run yet"); }) } as unknown as GetValidationRunUseCase;
    const useCase = new GetDeliverableValidationReportUseCase(fakeDeliverableRepository(deliverable(DeliverableType.ValidationReport)), getReadinessStatusUseCase, getValidationRunUseCase);

    const result = await useCase.execute(query);

    expect(result.latestRun).toBeUndefined();
    expect(result.readiness.status).toBe("NOT_READY");
  });

  it("refuses a deliverable that is not actually a VALIDATION_REPORT", async () => {
    const useCase = new GetDeliverableValidationReportUseCase(
      fakeDeliverableRepository(deliverable(DeliverableType.TechnicalMemo)),
      { execute: vi.fn() } as unknown as GetReadinessStatusUseCase,
      { execute: vi.fn() } as unknown as GetValidationRunUseCase,
    );
    await expect(useCase.execute(query)).rejects.toThrow(UnsupportedReadOnlyDeliverableError);
  });
});

describe("GetDeliverableCostReportUseCase (mission §14 — frozen Sprint 7 data only)", () => {
  it("fetches the most recent estimate for the tender, then the full frozen version by id", async () => {
    const listPricingEstimatesUseCase = { execute: vi.fn(async () => ({ items: [{ id: "estimate-1" }], total: 1 })) } as unknown as ListPricingEstimatesUseCase;
    const getPricingEstimateUseCase = {
      execute: vi.fn(async () => ({ id: "estimate-1", currentVersion: { amount: "1000.00", currency: "EUR", disclaimerText: "Estimation indicative..." } })),
    } as unknown as GetPricingEstimateUseCase;
    const useCase = new GetDeliverableCostReportUseCase(fakeDeliverableRepository(deliverable(DeliverableType.CostReport)), listPricingEstimatesUseCase, getPricingEstimateUseCase);

    const result = await useCase.execute(query);

    expect(listPricingEstimatesUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ tenderId: TENDER_ID, limit: 1, offset: 0 }));
    expect(getPricingEstimateUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ estimateId: "estimate-1" }));
    expect(result?.estimate.currentVersion.disclaimerText).toBe("Estimation indicative...");
    expect(result?.frozen).toBe(false);
  });

  it("returns undefined (never a fabricated 0€) when no estimate exists yet for the tender", async () => {
    const listPricingEstimatesUseCase = { execute: vi.fn(async () => ({ items: [], total: 0 })) } as unknown as ListPricingEstimatesUseCase;
    const getPricingEstimateUseCase = { execute: vi.fn() } as unknown as GetPricingEstimateUseCase;
    const useCase = new GetDeliverableCostReportUseCase(fakeDeliverableRepository(deliverable(DeliverableType.CostReport)), listPricingEstimatesUseCase, getPricingEstimateUseCase);

    const result = await useCase.execute(query);

    expect(result).toBeUndefined();
    expect(getPricingEstimateUseCase.execute).not.toHaveBeenCalled();
  });

  it("audit Codex P1-002 — once a frozen version is selected, always relit EXACTEMENT cette version, jamais la dernière estimation courante", async () => {
    const frozenDeliverable = deliverable(DeliverableType.CostReport);
    frozenDeliverable.selectCostReportEstimate({ pricingEstimateId: "estimate-1", versionNumber: 1, selectedBy: "user-1", occurredAt: NOW });

    const listPricingEstimatesUseCase = { execute: vi.fn(async () => ({ items: [{ id: "estimate-2" }], total: 1 })) } as unknown as ListPricingEstimatesUseCase;
    const getPricingEstimateUseCase = {
      execute: vi.fn(async () => ({ id: "estimate-1", currentVersion: { version: 1, amount: "500.00", currency: "EUR", disclaimerText: "Estimation indicative..." } })),
    } as unknown as GetPricingEstimateUseCase;
    const useCase = new GetDeliverableCostReportUseCase(fakeDeliverableRepository(frozenDeliverable), listPricingEstimatesUseCase, getPricingEstimateUseCase);

    const result = await useCase.execute(query);

    // Jamais une seconde lecture de "la dernière estimation" une fois figé.
    expect(listPricingEstimatesUseCase.execute).not.toHaveBeenCalled();
    expect(getPricingEstimateUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ estimateId: "estimate-1", version: 1 }));
    expect(result?.frozen).toBe(true);
    expect(result?.estimate.currentVersion.amount).toBe("500.00");
    expect(result?.selection).toEqual({ pricingEstimateId: "estimate-1", pricingEstimateVersionNumber: 1, selectedBy: "user-1", selectedAt: NOW.toISOString() });
  });
});

describe("GetDeliverableSignatureDocumentsUseCase (mission §14)", () => {
  it("fetches requirements and transactions in parallel, scoped by the deliverable's tenderId", async () => {
    const listSignatureRequirementsUseCase = { execute: vi.fn(async () => [{ id: "req-1" }]) } as unknown as ListSignatureRequirementsUseCase;
    const listSignatureTransactionsUseCase = { execute: vi.fn(async () => [{ transaction: { id: "tx-1" } }]) } as unknown as ListSignatureTransactionsUseCase;
    const useCase = new GetDeliverableSignatureDocumentsUseCase(
      fakeDeliverableRepository(deliverable(DeliverableType.SignatureDocuments)),
      listSignatureRequirementsUseCase,
      listSignatureTransactionsUseCase,
    );

    const result = await useCase.execute(query);

    expect(listSignatureRequirementsUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ tenderId: TENDER_ID }));
    expect(listSignatureTransactionsUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ tenderId: TENDER_ID }));
    expect(result.requirements).toHaveLength(1);
    expect(result.transactions).toHaveLength(1);
  });
});

describe("GetDeliverableSubmissionPackageUseCase (mission §14 — never recreates the package)", () => {
  it("delegates entirely to ListSubmissionPackagesUseCase, scoped by the deliverable's tenderId", async () => {
    const listSubmissionPackagesUseCase = { execute: vi.fn(async () => [{ id: "package-1", version: 1, status: "COMPLETED" }]) } as unknown as ListSubmissionPackagesUseCase;
    const useCase = new GetDeliverableSubmissionPackageUseCase(fakeDeliverableRepository(deliverable(DeliverableType.SubmissionPackage)), listSubmissionPackagesUseCase);

    const result = await useCase.execute(query);

    expect(listSubmissionPackagesUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ tenderId: TENDER_ID }));
    expect(result).toHaveLength(1);
  });

  it("refuses a deliverable that is not actually a SUBMISSION_PACKAGE", async () => {
    const listSubmissionPackagesUseCase = { execute: vi.fn() } as unknown as ListSubmissionPackagesUseCase;
    const useCase = new GetDeliverableSubmissionPackageUseCase(fakeDeliverableRepository(deliverable(DeliverableType.Checklist)), listSubmissionPackagesUseCase);
    await expect(useCase.execute(query)).rejects.toThrow(UnsupportedReadOnlyDeliverableError);
  });
});
