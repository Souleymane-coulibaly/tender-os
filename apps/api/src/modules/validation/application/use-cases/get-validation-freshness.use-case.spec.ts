import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { TenderBusinessAnalysisNotFoundError } from "../../../analysis";
import { GetValidationFreshnessUseCase } from "./get-validation-freshness.use-case";

function buildUseCase(input: {
  approval: { candidateCompanyId?: string | undefined; analysisVersion?: number | undefined; technicalMemoRevisionFingerprint?: string | undefined; id?: string | undefined } | null;
  candidateCompanyId?: string | undefined;
  analysisResult?: { analysisVersion: number; dceRevision: number; analysisFreshness: string } | "not-found";
  technicalMemoRevisionFingerprint?: string | undefined;
}) {
  const finalApprovalRepository = {
    create: vi.fn(),
    findById: vi.fn(),
    save: vi.fn(),
    findActiveForTender: vi.fn(async () => (input.approval ? { id: input.approval.id ?? randomUUID(), ...input.approval } : null)),
  };
  const getTenderUseCase = { execute: vi.fn(async () => ({ clientAccountId: randomUUID(), candidateCompanyId: input.candidateCompanyId })) };
  const assertClientAccessUseCase = { execute: vi.fn(async () => undefined) };
  const getEffectiveTenderAnalysisSummaryUseCase = {
    execute: vi.fn(async () => {
      if (input.analysisResult === "not-found" || input.analysisResult === undefined) throw new TenderBusinessAnalysisNotFoundError();
      return input.analysisResult;
    }),
  };
  const getTechnicalMemoRevisionFingerprintForTenderUseCase = { execute: vi.fn(async () => input.technicalMemoRevisionFingerprint) };

  const useCase = new GetValidationFreshnessUseCase(
    finalApprovalRepository as never,
    getTenderUseCase as never,
    assertClientAccessUseCase as never,
    getEffectiveTenderAnalysisSummaryUseCase as never,
    getTechnicalMemoRevisionFingerprintForTenderUseCase as never,
  );

  return { useCase, finalApprovalRepository };
}

describe("GetValidationFreshnessUseCase (Checkpoint 2.1-P2.1-FIX-E)", () => {
  it("UNKNOWN + hasActiveApproval=false when no active FinalApproval exists", async () => {
    const { useCase } = buildUseCase({ approval: null });
    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", tenderId: "tender-1" });
    expect(result).toMatchObject({ freshness: "UNKNOWN", hasActiveApproval: false });
  });

  it("CURRENT when candidate matches and no analysis/memo exists for the tender", async () => {
    const { useCase } = buildUseCase({ approval: { candidateCompanyId: undefined }, candidateCompanyId: undefined });
    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", tenderId: "tender-1" });
    expect(result).toMatchObject({ freshness: "CURRENT", hasActiveApproval: true });
  });

  it("STALE when the tender's candidate changed since the approval", async () => {
    const { useCase } = buildUseCase({ approval: { candidateCompanyId: "candidate-alpha" }, candidateCompanyId: "candidate-beta" });
    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", tenderId: "tender-1" });
    expect(result.freshness).toBe("STALE");
  });

  it("STALE when the DCE changed since the approval (captured analysisVersion no longer the latest)", async () => {
    const { useCase } = buildUseCase({ approval: { analysisVersion: 1 }, analysisResult: { analysisVersion: 2, dceRevision: 2, analysisFreshness: "CURRENT" } });
    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", tenderId: "tender-1" });
    expect(result).toMatchObject({ freshness: "STALE", currentAnalysisVersion: 2, currentAnalysisFreshness: "CURRENT" });
  });

  it("STALE when the technical memo content changed since the approval", async () => {
    const { useCase } = buildUseCase({ approval: { technicalMemoRevisionFingerprint: "fp-old" }, technicalMemoRevisionFingerprint: "fp-new" });
    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", tenderId: "tender-1" });
    expect(result.freshness).toBe("STALE");
  });

  it("propagates the active approval id when one exists", async () => {
    const approvalId = randomUUID();
    const { useCase } = buildUseCase({ approval: { id: approvalId } });
    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", tenderId: "tender-1" });
    expect(result.activeApprovalId).toBe(approvalId);
  });
});
