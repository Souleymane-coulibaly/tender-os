import { describe, expect, it, vi } from "vitest";
import { GetTenderSubmissionReadinessUseCase, SubmissionReadinessStatus } from "./get-tender-submission-readiness.use-case";
import { TenderSubmission } from "../../domain/tender-submission.aggregate";
import { SubmissionPlatform } from "../../domain/submission-platform";
import type { TenderSubmissionRepository } from "../ports/tender-submission.repository";
import type { SubmissionAccessService } from "../services/submission-access.service";
import { ReadinessStatus, type GetReadinessStatusUseCase } from "../../../validation";
import { PackageStatus, type ListSubmissionPackagesUseCase, type SubmissionPackageSummary } from "../../../submission-package";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function fakeAccessService(tenderOverrides: Partial<{ submissionDeadline: string }> = {}): SubmissionAccessService {
  return { assertTenderAccess: vi.fn(async () => ({ clientAccountId: "client-1", submissionDeadline: tenderOverrides.submissionDeadline }) as never) } as unknown as SubmissionAccessService;
}
function fakeReadiness(status: string): GetReadinessStatusUseCase {
  return { execute: vi.fn(async () => ({ status })) } as unknown as GetReadinessStatusUseCase;
}
function completedPackage(overrides: Partial<SubmissionPackageSummary> = {}): SubmissionPackageSummary {
  return { id: "pkg-1", tenderId: TENDER_ID, version: 1, status: PackageStatus.Completed, validationRunId: "run-1", approvalId: "approval-1", readinessStatus: "READY_FOR_SUBMISSION", files: [], fileHash: "a".repeat(64), createdAt: NOW.toISOString(), ...overrides };
}
function fakePackages(packages: readonly SubmissionPackageSummary[]): ListSubmissionPackagesUseCase {
  return { execute: vi.fn(async () => packages) } as unknown as ListSubmissionPackagesUseCase;
}
function fakeRepository(active: TenderSubmission | null = null): TenderSubmissionRepository {
  return { create: vi.fn(), findById: vi.fn(), findActiveForTender: vi.fn(async () => active), listByTender: vi.fn(), save: vi.fn(), replaceActive: vi.fn() };
}

describe("GetTenderSubmissionReadinessUseCase", () => {
  it("is READY_FOR_SUBMISSION when validation is approved, a completed package exists, and nothing is in flight", async () => {
    const useCase = new GetTenderSubmissionReadinessUseCase(fakeAccessService(), fakeReadiness(ReadinessStatus.ReadyForSubmission), fakePackages([completedPackage()]), fakeRepository());
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.readinessStatus).toBe(SubmissionReadinessStatus.ReadyForSubmission);
    expect(result.canSubmit).toBe(true);
    expect(result.packageId).toBe("pkg-1");
    expect(result.packageVersion).toBe(1);
  });

  it("blocks when no completed package exists at all", async () => {
    const useCase = new GetTenderSubmissionReadinessUseCase(fakeAccessService(), fakeReadiness(ReadinessStatus.ReadyForSubmission), fakePackages([]), fakeRepository());
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canSubmit).toBe(false);
    expect(result.blockers).toContain("Le package final est introuvable.");
  });

  it("only ever pins the LATEST completed package, never an older one still present", async () => {
    const older = completedPackage({ id: "pkg-old", version: 1 });
    const newer = completedPackage({ id: "pkg-new", version: 2 });
    const useCase = new GetTenderSubmissionReadinessUseCase(fakeAccessService(), fakeReadiness(ReadinessStatus.ReadyForSubmission), fakePackages([older, newer]), fakeRepository());
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.packageId).toBe("pkg-new");
    expect(result.packageVersion).toBe(2);
  });

  it("blocks when validation is NOT_READY", async () => {
    const useCase = new GetTenderSubmissionReadinessUseCase(fakeAccessService(), fakeReadiness(ReadinessStatus.NotReady), fakePackages([completedPackage()]), fakeRepository());
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canSubmit).toBe(false);
    expect(result.blockers).toContain("Le dossier n'est pas prêt pour le dépôt.");
  });

  it("blocks with a dedicated message while a mandatory signature is still in progress (never silently ignored)", async () => {
    const useCase = new GetTenderSubmissionReadinessUseCase(fakeAccessService(), fakeReadiness(ReadinessStatus.SignatureInProgress), fakePackages([completedPackage()]), fakeRepository());
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canSubmit).toBe(false);
    expect(result.blockers).toContain("Une ou plusieurs signatures requises ne sont pas terminées.");
    expect(result.signatureRequirement).toBe(ReadinessStatus.SignatureInProgress);
  });

  it("never blocks on signature when NOT_REQUIRED (validation already reconciled it as satisfied)", async () => {
    const useCase = new GetTenderSubmissionReadinessUseCase(fakeAccessService(), fakeReadiness(ReadinessStatus.ReadyForSubmission), fakePackages([completedPackage()]), fakeRepository());
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.signatureRequirement).toBe("SATISFIED_OR_NOT_REQUIRED");
    expect(result.canSubmit).toBe(true);
  });

  it("reports the deadline as passed and blocks, never silently accepting it", async () => {
    const useCase = new GetTenderSubmissionReadinessUseCase(fakeAccessService({ submissionDeadline: "2020-01-01T00:00:00.000Z" }), fakeReadiness(ReadinessStatus.ReadyForSubmission), fakePackages([completedPackage()]), fakeRepository());
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.canSubmit).toBe(false);
    expect(result.blockers).toContain("La date limite de dépôt est dépassée.");
    expect(result.remainingTimeMs).toBeLessThan(0);
  });

  it("reports SUBMISSION_IN_PROGRESS when a draft deposit was already started", async () => {
    const inProgress = TenderSubmission.start({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), startedByUserId: "user-1", platform: SubmissionPlatform.Place, occurredAt: NOW });
    const useCase = new GetTenderSubmissionReadinessUseCase(fakeAccessService(), fakeReadiness(ReadinessStatus.ReadyForSubmission), fakePackages([completedPackage()]), fakeRepository(inProgress));
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.readinessStatus).toBe(SubmissionReadinessStatus.SubmissionInProgress);
    expect(result.canSubmit).toBe(false);
  });

  it("reports ALREADY_SUBMITTED once a submission is SUBMITTED/RECEIPT_CONFIRMED, never inviting a fresh record", async () => {
    const submitted = TenderSubmission.record({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), submittedByUserId: "user-1", submittedAt: NOW, platform: SubmissionPlatform.Place, occurredAt: NOW });
    const useCase = new GetTenderSubmissionReadinessUseCase(fakeAccessService(), fakeReadiness(ReadinessStatus.ReadyForSubmission), fakePackages([completedPackage()]), fakeRepository(submitted));
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result.readinessStatus).toBe(SubmissionReadinessStatus.AlreadySubmitted);
    expect(result.canSubmit).toBe(false);
    expect(result.activeSubmissionId).toBe("sub-1");
  });
});
