import { describe, expect, it, vi } from "vitest";
import { GetTenderSubmissionReadinessUseCase, SubmissionReadinessStatus } from "./get-tender-submission-readiness.use-case";
import { TenderSubmission } from "../../domain/tender-submission.aggregate";
import { SubmissionPlatform } from "../../domain/submission-platform";
import type { TenderSubmissionRepository } from "../ports/tender-submission.repository";
import type { SubmissionAccessService } from "../services/submission-access.service";
import { ReadinessStatus, type GetReadinessStatusUseCase } from "../../../validation";
import { PackageStatus, type ListSubmissionPackagesUseCase, type SubmissionPackageSummary } from "../../../submission-package";
import { GoNoGoReportNotFoundError } from "../../../opportunity";
import { TenderBusinessAnalysisNotFoundError } from "../../../analysis";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function fakeAccessService(tenderOverrides: { submissionDeadline?: string | undefined; candidateCompanyId?: string | undefined } = {}): SubmissionAccessService {
  const candidateCompanyId = "candidateCompanyId" in tenderOverrides ? tenderOverrides.candidateCompanyId : "candidate-alpha";
  return {
    assertTenderAccess: vi.fn(async () => ({ clientAccountId: "client-1", submissionDeadline: tenderOverrides.submissionDeadline, candidateCompanyId }) as never),
  } as unknown as SubmissionAccessService;
}
function fakeReadiness(status: string): GetReadinessStatusUseCase {
  return { execute: vi.fn(async () => ({ status })) } as unknown as GetReadinessStatusUseCase;
}
function completedPackage(overrides: Partial<SubmissionPackageSummary> = {}): SubmissionPackageSummary {
  return { id: "pkg-1", tenderId: TENDER_ID, version: 1, status: PackageStatus.Completed, validationRunId: "run-1", approvalId: "approval-1", readinessStatus: "READY_FOR_SUBMISSION", files: [], responsePackages: [], fileHash: "a".repeat(64), createdAt: NOW.toISOString(), ...overrides };
}
function fakePackages(packages: readonly SubmissionPackageSummary[]): ListSubmissionPackagesUseCase {
  return { execute: vi.fn(async () => packages) } as unknown as ListSubmissionPackagesUseCase;
}
function fakeRepository(active: TenderSubmission | null = null): TenderSubmissionRepository {
  return { create: vi.fn(), findById: vi.fn(), findActiveForTender: vi.fn(async () => active), listByTender: vi.fn(), save: vi.fn(), replaceActive: vi.fn(), listResponsePackageProvenance: vi.fn(async () => []) };
}

/**
 * Checkpoint 2.1-P2.1-FIX-F — les 8 nouvelles dépendances de fraîcheur par défaut à un état
 * "satisfait" (aucune raison bloquante ajoutée) — les tests EXISTANTS ci-dessous n'exercent que le
 * comportement validation/package/deadline HISTORIQUE, jamais affecté par ces nouvelles dimensions
 * sauf override explicite dans les nouveaux tests FIX-F.
 */
function buildUseCase(input: {
  accessService?: SubmissionAccessService;
  readinessUseCase?: GetReadinessStatusUseCase;
  packagesUseCase?: ListSubmissionPackagesUseCase;
  repository?: TenderSubmissionRepository;
  getEffectiveTenderAnalysisSummaryUseCase?: { execute: ReturnType<typeof vi.fn> };
  getChecklistFreshnessUseCase?: { execute: ReturnType<typeof vi.fn> };
  getGoNoGoReportUseCase?: { execute: ReturnType<typeof vi.fn> };
  listTechnicalMemosUseCase?: { execute: ReturnType<typeof vi.fn> };
  getTechnicalMemoFreshnessUseCase?: { execute: ReturnType<typeof vi.fn> };
  getValidationFreshnessUseCase?: { execute: ReturnType<typeof vi.fn> };
  getRequiredResponsePackagesForTenderUseCase?: { execute: ReturnType<typeof vi.fn> };
  getResponsePackageFreshnessUseCase?: { execute: ReturnType<typeof vi.fn> };
}): GetTenderSubmissionReadinessUseCase {
  return new GetTenderSubmissionReadinessUseCase(
    input.accessService ?? fakeAccessService(),
    input.readinessUseCase ?? fakeReadiness(ReadinessStatus.ReadyForSubmission),
    input.packagesUseCase ?? fakePackages([completedPackage()]),
    input.repository ?? fakeRepository(),
    (input.getEffectiveTenderAnalysisSummaryUseCase ?? { execute: vi.fn(async () => ({ analysisVersion: 1, dceRevision: 1, analysisFreshness: "CURRENT" })) }) as never,
    (input.getChecklistFreshnessUseCase ?? { execute: vi.fn(async () => ({ checklistFreshness: "CURRENT" })) }) as never,
    (input.getGoNoGoReportUseCase ??
      {
        execute: vi.fn(async () => {
          throw new GoNoGoReportNotFoundError();
        }),
      }) as never,
    (input.listTechnicalMemosUseCase ?? { execute: vi.fn(async () => []) }) as never,
    (input.getTechnicalMemoFreshnessUseCase ?? { execute: vi.fn(async () => ({ freshness: "CURRENT" })) }) as never,
    (input.getValidationFreshnessUseCase ?? { execute: vi.fn(async () => ({ hasActiveApproval: true, freshness: "CURRENT" })) }) as never,
    (input.getRequiredResponsePackagesForTenderUseCase ??
      { execute: vi.fn(async () => [{ lotId: undefined, matchingPackages: [{ id: "response-package-1", lotId: undefined, currentVersionId: "version-1", status: "VALIDATED" }] }]) }) as never,
    (input.getResponsePackageFreshnessUseCase ?? { execute: vi.fn(async () => ({ freshness: "CURRENT" })) }) as never,
  );
}

describe("GetTenderSubmissionReadinessUseCase", () => {
  it("is READY_FOR_SUBMISSION when validation is approved, a completed package exists, and nothing is in flight", async () => {
    const useCase = buildUseCase({});
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.readinessStatus).toBe(SubmissionReadinessStatus.ReadyForSubmission);
    expect(result.canSubmit).toBe(true);
    expect(result.packageId).toBe("pkg-1");
    expect(result.packageVersion).toBe(1);
    expect(result.fileReadinessReasons).toEqual([]);
  });

  it("blocks when no completed package exists at all", async () => {
    const useCase = buildUseCase({ packagesUseCase: fakePackages([]) });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canSubmit).toBe(false);
    expect(result.blockers).toContain("Le package final est introuvable.");
  });

  it("only ever pins the LATEST completed package, never an older one still present", async () => {
    const older = completedPackage({ id: "pkg-old", version: 1 });
    const newer = completedPackage({ id: "pkg-new", version: 2 });
    const useCase = buildUseCase({ packagesUseCase: fakePackages([older, newer]) });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.packageId).toBe("pkg-new");
    expect(result.packageVersion).toBe(2);
  });

  it("blocks when validation is NOT_READY", async () => {
    const useCase = buildUseCase({ readinessUseCase: fakeReadiness(ReadinessStatus.NotReady) });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canSubmit).toBe(false);
    expect(result.blockers).toContain("Le dossier n'est pas prêt pour le dépôt.");
  });

  it("blocks with a dedicated message while a mandatory signature is still in progress (never silently ignored)", async () => {
    const useCase = buildUseCase({ readinessUseCase: fakeReadiness(ReadinessStatus.SignatureInProgress) });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canSubmit).toBe(false);
    expect(result.blockers).toContain("Une ou plusieurs signatures requises ne sont pas terminées.");
    expect(result.signatureRequirement).toBe(ReadinessStatus.SignatureInProgress);
  });

  it("never blocks on signature when NOT_REQUIRED (validation already reconciled it as satisfied)", async () => {
    const useCase = buildUseCase({});
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.signatureRequirement).toBe("SATISFIED_OR_NOT_REQUIRED");
    expect(result.canSubmit).toBe(true);
  });

  it("reports the deadline as passed and blocks, never silently accepting it", async () => {
    const useCase = buildUseCase({ accessService: fakeAccessService({ submissionDeadline: "2020-01-01T00:00:00.000Z" }) });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canSubmit).toBe(false);
    expect(result.blockers).toContain("La date limite de dépôt est dépassée.");
    expect(result.remainingTimeMs).toBeLessThan(0);
  });

  it("reports SUBMISSION_IN_PROGRESS when a draft deposit was already started", async () => {
    const inProgress = TenderSubmission.start({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), startedByUserId: "user-1", platform: SubmissionPlatform.Place, occurredAt: NOW });
    const useCase = buildUseCase({ repository: fakeRepository(inProgress) });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.readinessStatus).toBe(SubmissionReadinessStatus.SubmissionInProgress);
    expect(result.canSubmit).toBe(false);
  });

  it("reports ALREADY_SUBMITTED once a submission is SUBMITTED/RECEIPT_CONFIRMED, never inviting a fresh record", async () => {
    const submitted = TenderSubmission.record({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), submittedByUserId: "user-1", submittedAt: NOW, platform: SubmissionPlatform.Place, occurredAt: NOW });
    const useCase = buildUseCase({ repository: fakeRepository(submitted) });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.readinessStatus).toBe(SubmissionReadinessStatus.AlreadySubmitted);
    expect(result.canSubmit).toBe(false);
    expect(result.activeSubmissionId).toBe("sub-1");
  });
});

describe("GetTenderSubmissionReadinessUseCase — dimensions de fraîcheur du dossier (Checkpoint 2.1-P2.1-FIX-F)", () => {
  // BLOQUANT (mission §61 "no god validation") — une Validation CURRENT ne doit jamais masquer une
  // autre dimension bloquante : même avec `readinessUseCase` renvoyant READY_FOR_SUBMISSION (le
  // signal HISTORIQUE), une Analyse STALE bloque désormais réellement le dépôt.
  it("BLOQUANT — analysis STALE blocks even when the historical validation signal alone was READY_FOR_SUBMISSION", async () => {
    const useCase = buildUseCase({ getEffectiveTenderAnalysisSummaryUseCase: { execute: vi.fn(async () => ({ analysisVersion: 1, dceRevision: 1, analysisFreshness: "STALE" })) } });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canSubmit).toBe(false);
    expect(result.fileReadinessReasons).toContainEqual(expect.objectContaining({ code: "ANALYSIS_STALE" }));
  });

  it("BLOQUANT — candidate missing blocks", async () => {
    const useCase = buildUseCase({ accessService: fakeAccessService({ candidateCompanyId: undefined }) });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canSubmit).toBe(false);
    expect(result.fileReadinessReasons).toContainEqual(expect.objectContaining({ code: "CANDIDATE_MISSING" }));
  });

  it("BLOQUANT — the NEW validation freshness signal (FIX-E) blocks even when the historical readiness status was satisfied", async () => {
    const useCase = buildUseCase({ getValidationFreshnessUseCase: { execute: vi.fn(async () => ({ hasActiveApproval: true, freshness: "STALE" })) } });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canSubmit).toBe(false);
    expect(result.fileReadinessReasons).toContainEqual(expect.objectContaining({ code: "VALIDATION_STALE" }));
  });

  it("BLOQUANT — response package STALE blocks the final dossier even when the legacy submission-package pipeline is satisfied", async () => {
    const useCase = buildUseCase({ getResponsePackageFreshnessUseCase: { execute: vi.fn(async () => ({ freshness: "STALE" })) } });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canSubmit).toBe(false);
    expect(result.fileReadinessReasons).toContainEqual(expect.objectContaining({ code: "RESPONSE_PACKAGE_STALE" }));
  });

  it("does not fabricate a technical memo dependency when the tender has none", async () => {
    const memoFreshnessSpy = vi.fn(async () => ({ freshness: "STALE" }));
    const useCase = buildUseCase({ listTechnicalMemosUseCase: { execute: vi.fn(async () => []) }, getTechnicalMemoFreshnessUseCase: { execute: memoFreshnessSpy } });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(memoFreshnessSpy).not.toHaveBeenCalled();
    expect(result.fileReadinessReasons.some((r) => r.source === "TECHNICAL_MEMO")).toBe(false);
  });

  it("never lets an analysis missing entirely propagate as an unhandled rejection — treated as ANALYSIS_MISSING", async () => {
    const useCase = buildUseCase({
      getEffectiveTenderAnalysisSummaryUseCase: {
        execute: vi.fn(async () => {
          throw new TenderBusinessAnalysisNotFoundError();
        }),
      },
    });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.fileReadinessReasons).toContainEqual(expect.objectContaining({ code: "ANALYSIS_MISSING" }));
  });
});

describe("GetTenderSubmissionReadinessUseCase — multi-lot (Checkpoint TENDEROS-2.1-P2.2-F2.3)", () => {
  it("TEST TWO SELECTED LOTS (mission §45) — READY when both required lots resolve to a CURRENT/validated package", async () => {
    const useCase = buildUseCase({
      getRequiredResponsePackagesForTenderUseCase: {
        execute: vi.fn(async () => [
          { lotId: "lot-a", matchingPackages: [{ id: "pkg-a", lotId: "lot-a", currentVersionId: "v-a", status: "VALIDATED" }] },
          { lotId: "lot-b", matchingPackages: [{ id: "pkg-b", lotId: "lot-b", currentVersionId: "v-b", status: "VALIDATED" }] },
        ]),
      },
    });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canSubmit).toBe(true);
    expect(result.fileReadinessReasons.filter((r) => r.source === "RESPONSE_PACKAGE")).toEqual([]);
  });

  it("TEST NON-SELECTED LOT (mission §46) — a lot that exists but was never selected for response never appears as a requirement, so its stale/missing package never blocks", async () => {
    // lot-c is simply absent from the requirements (the fake represents what
    // GetRequiredResponsePackagesForTenderUseCase already filtered via selectedForResponse) — this
    // proves readiness only ever looks at what it was given, never re-derives participation itself.
    const useCase = buildUseCase({
      getRequiredResponsePackagesForTenderUseCase: {
        execute: vi.fn(async () => [{ lotId: "lot-a", matchingPackages: [{ id: "pkg-a", lotId: "lot-a", currentVersionId: "v-a", status: "VALIDATED" }] }]),
      },
    });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canSubmit).toBe(true);
  });

  it("TEST MISSING REQUIRED LOT (mission §47) — BLOCKED when a required lot has zero matching packages", async () => {
    const useCase = buildUseCase({
      getRequiredResponsePackagesForTenderUseCase: {
        execute: vi.fn(async () => [
          { lotId: "lot-a", matchingPackages: [{ id: "pkg-a", lotId: "lot-a", currentVersionId: "v-a", status: "VALIDATED" }] },
          { lotId: "lot-b", matchingPackages: [] },
        ]),
      },
    });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canSubmit).toBe(false);
    expect(result.fileReadinessReasons).toContainEqual(expect.objectContaining({ code: "RESPONSE_PACKAGE_MISSING" }));
  });

  it("TEST STALE REQUIRED LOT (mission §48) — BLOCKED when one of several required lots is STALE, even though the other is CURRENT", async () => {
    const useCase = buildUseCase({
      getRequiredResponsePackagesForTenderUseCase: {
        execute: vi.fn(async () => [
          { lotId: "lot-a", matchingPackages: [{ id: "pkg-a", lotId: "lot-a", currentVersionId: "v-a", status: "VALIDATED" }] },
          { lotId: "lot-b", matchingPackages: [{ id: "pkg-b", lotId: "lot-b", currentVersionId: "v-b", status: "VALIDATED" }] },
        ]),
      },
      getResponsePackageFreshnessUseCase: {
        execute: vi.fn(async ({ responsePackageId }: { responsePackageId: string }) => ({ freshness: responsePackageId === "pkg-b" ? "STALE" : "CURRENT" })),
      },
    });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canSubmit).toBe(false);
    expect(result.fileReadinessReasons).toContainEqual(expect.objectContaining({ code: "RESPONSE_PACKAGE_STALE" }));
  });

  it("TEST UNVALIDATED REQUIRED LOT (mission §49) — BLOCKED when one required lot's current version isn't validated yet", async () => {
    const useCase = buildUseCase({
      getRequiredResponsePackagesForTenderUseCase: {
        execute: vi.fn(async () => [
          { lotId: "lot-a", matchingPackages: [{ id: "pkg-a", lotId: "lot-a", currentVersionId: "v-a", status: "VALIDATED" }] },
          { lotId: "lot-b", matchingPackages: [{ id: "pkg-b", lotId: "lot-b", currentVersionId: "v-b", status: "IN_REVIEW" }] },
        ]),
      },
    });
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canSubmit).toBe(false);
    expect(result.fileReadinessReasons).toContainEqual(expect.objectContaining({ code: "RESPONSE_PACKAGE_INCOMPLETE" }));
  });
});
