import { describe, expect, it, vi } from "vitest";
import { CreateSubmissionPackageUseCase } from "./create-submission-package.use-case";

const ORG = "org-1";
const TENDER = "tender-1";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 1, mission TEST 4 — ce use case n'a aucun test unitaire
 * dédié avant ce Checkpoint (couvert uniquement par la suite HTTP réelle). Ce fichier prouve
 * spécifiquement le NOUVEAU gate d'entitlement : toutes les autres dépendances sont des stubs qui
 * ÉCHOUENT s'ils sont appelés, pour prouver que le refus survient AVANT tout autre accès (Final
 * Approval, Export, Signature, Response Package), jamais après un travail inutile.
 */
function neverCalled(name: string) {
  return vi.fn(async () => {
    throw new Error(`${name} should never be called when the organization is not entitled`);
  });
}

describe("CreateSubmissionPackageUseCase — entitlement gate", () => {
  it("refuses (never touches FinalApprovalRepository or any downstream dependency) when the organization has no entitlement to operate on this tender", async () => {
    const entitlementService = {
      canOperateOnTender: vi.fn(async () => false),
      runTenderOperationEntitled: vi.fn(async () => {
        throw Object.assign(new Error("not entitled"), { code: "TENDER_OPERATION_NOT_ENTITLED" });
      }),
    };
    const getTenderUseCase = { execute: vi.fn(async () => ({ id: TENDER, organizationId: ORG, clientAccountId: "client-1" })) };
    const assertClientAccessUseCase = { execute: vi.fn(async () => undefined) };
    const finalApprovalRepository = { findActiveForTender: neverCalled("finalApprovalRepository.findActiveForTender") };
    const exportJobRepository = { findById: neverCalled("exportJobRepository.findById") };
    const signatureRequirementRepository = { listByTender: neverCalled("signatureRequirementRepository.listByTender") };
    const signatureTransactionRepository = { listByTender: neverCalled("signatureTransactionRepository.listByTender") };
    const getSubmittableResponsePackageVersionUseCase = { execute: neverCalled("getSubmittableResponsePackageVersionUseCase.execute") };
    const getResponsePackageFreshnessUseCase = { execute: neverCalled("getResponsePackageFreshnessUseCase.execute") };
    const packageAssemblyService = { assemble: neverCalled("packageAssemblyService.assemble") };
    const clock = { now: () => new Date("2026-08-21T00:00:00.000Z") };

    const useCase = new CreateSubmissionPackageUseCase(
      finalApprovalRepository as never,
      exportJobRepository as never,
      signatureRequirementRepository as never,
      signatureTransactionRepository as never,
      getSubmittableResponsePackageVersionUseCase as never,
      getResponsePackageFreshnessUseCase as never,
      packageAssemblyService as never,
      getTenderUseCase as never,
      assertClientAccessUseCase as never,
      clock as never,
      entitlementService as never,
    );

    await expect(useCase.execute({ organizationId: ORG, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER })).rejects.toMatchObject({
      code: "TENDER_OPERATION_NOT_ENTITLED",
    });

    expect(entitlementService.runTenderOperationEntitled).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG, tenderId: TENDER }), expect.any(Function));
    expect(finalApprovalRepository.findActiveForTender).not.toHaveBeenCalled();
    expect(getSubmittableResponsePackageVersionUseCase.execute).not.toHaveBeenCalled();
  });
});
