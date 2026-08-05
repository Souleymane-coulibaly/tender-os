import { describe, expect, it, vi } from "vitest";
import { RecordTenderSubmissionUseCase } from "./record-tender-submission.use-case";
import { TenderSubmission } from "../../domain/tender-submission.aggregate";
import { ActiveTenderSubmissionAlreadyExistsError, CustomPlatformNameRequiredError, SubmissionDeadlinePassedError, SubmissionPackageMissingError, SubmissionPackageOutdatedError, SubmissionPackageVersionMismatchError } from "../../domain/errors";
import { SubmissionPlatform } from "../../domain/submission-platform";
import { TenderSubmissionStatus } from "../../domain/tender-submission-status";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { TenderSubmissionRepository } from "../ports/tender-submission.repository";
import type { SubmissionAccessService } from "../services/submission-access.service";
import { SubmissionPackageResolverService } from "../services/submission-package-resolver.service";
import { PackageFileSourceType, PackageStatus, type ListSubmissionPackagesUseCase, type SubmissionPackageSummary } from "../../../submission-package";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";
const MANIFEST_FILE = { archivePath: "manifest.json", sourceType: PackageFileSourceType.Manifest, fileName: "manifest.json", mimeType: "application/json", fileSize: 128, fileHash: "m".repeat(64), order: 0 };

function fakeClock() {
  return { now: () => NOW };
}
function fakeIdGenerator(id = "sub-new") {
  return { generate: () => id };
}
function fakeAccessService(submissionDeadline?: string): SubmissionAccessService {
  return { assertTenderAccess: vi.fn(async () => ({ clientAccountId: "client-1", submissionDeadline }) as never) } as unknown as SubmissionAccessService;
}
function fakeAuditLogWriter(): AuditLogWriter {
  return { record: vi.fn(async () => undefined) };
}
function completedPackage(overrides: Partial<SubmissionPackageSummary> = {}): SubmissionPackageSummary {
  return { id: "pkg-1", tenderId: TENDER_ID, version: 1, status: PackageStatus.Completed, validationRunId: "run-1", approvalId: "approval-1", readinessStatus: "READY_FOR_SUBMISSION", files: [MANIFEST_FILE], fileHash: "a".repeat(64), createdAt: NOW.toISOString(), ...overrides };
}
function resolverWith(packages: readonly SubmissionPackageSummary[]): SubmissionPackageResolverService {
  const listUseCase = { execute: vi.fn(async () => packages) } as unknown as ListSubmissionPackagesUseCase;
  return new SubmissionPackageResolverService(listUseCase);
}
function inMemoryRepository(seed: TenderSubmission | null = null): TenderSubmissionRepository {
  let active = seed;
  return {
    create: vi.fn(async (s: TenderSubmission) => {
      active = s;
    }),
    findById: vi.fn(),
    findActiveForTender: vi.fn(async () => active),
    listByTender: vi.fn(),
    save: vi.fn(async (s: TenderSubmission) => {
      active = s;
    }),
    replaceActive: vi.fn(),
  };
}

describe("RecordTenderSubmissionUseCase", () => {
  it("creates a fresh SUBMITTED submission pinned to the exact latest completed package", async () => {
    const repository = inMemoryRepository();
    const useCase = new RecordTenderSubmissionUseCase(fakeAccessService(), resolverWith([completedPackage()]), repository, fakeAuditLogWriter(), fakeClock(), fakeIdGenerator());

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW });

    expect(result.status).toBe(TenderSubmissionStatus.Submitted);
    expect(result.packageId).toBe("pkg-1");
    expect(repository.create).toHaveBeenCalledOnce();
  });

  it("mission §18/§29 (correctif audit Codex P1) — resolves and persists the manifest's own hash, never left empty", async () => {
    const repository = inMemoryRepository();
    const useCase = new RecordTenderSubmissionUseCase(fakeAccessService(), resolverWith([completedPackage()]), repository, fakeAuditLogWriter(), fakeClock(), fakeIdGenerator());

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW });

    expect(result.manifestHash).toBe(MANIFEST_FILE.fileHash);
  });

  it("mission §29 (correctif audit Codex P1) — refuses a package with no manifest.json entry at all, never fabricating a hash", async () => {
    const packageWithoutManifest = completedPackage({ files: [] });
    const useCase = new RecordTenderSubmissionUseCase(fakeAccessService(), resolverWith([packageWithoutManifest]), inMemoryRepository(), fakeAuditLogWriter(), fakeClock(), fakeIdGenerator());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW })).rejects.toBeInstanceOf(SubmissionPackageMissingError);
  });

  it("refuses a package that is no longer the latest COMPLETED version", async () => {
    const older = completedPackage({ id: "pkg-old", version: 1 });
    const newer = completedPackage({ id: "pkg-new", version: 2 });
    const useCase = new RecordTenderSubmissionUseCase(fakeAccessService(), resolverWith([older, newer]), inMemoryRepository(), fakeAuditLogWriter(), fakeClock(), fakeIdGenerator());

    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-old", platform: SubmissionPlatform.Place, submittedAt: NOW })).rejects.toBeInstanceOf(SubmissionPackageOutdatedError);
  });

  it("refuses a package that does not exist or is not COMPLETED", async () => {
    const useCase = new RecordTenderSubmissionUseCase(fakeAccessService(), resolverWith([]), inMemoryRepository(), fakeAuditLogWriter(), fakeClock(), fakeIdGenerator());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "missing", platform: SubmissionPlatform.Place, submittedAt: NOW })).rejects.toBeInstanceOf(SubmissionPackageMissingError);
  });

  it("refuses OTHER platform without a custom name", async () => {
    const useCase = new RecordTenderSubmissionUseCase(fakeAccessService(), resolverWith([completedPackage()]), inMemoryRepository(), fakeAuditLogWriter(), fakeClock(), fakeIdGenerator());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Other, submittedAt: NOW })).rejects.toBeInstanceOf(CustomPlatformNameRequiredError);
  });

  it("refuses a submission recorded after the deadline, never silently", async () => {
    const useCase = new RecordTenderSubmissionUseCase(fakeAccessService("2020-01-01T00:00:00.000Z"), resolverWith([completedPackage()]), inMemoryRepository(), fakeAuditLogWriter(), fakeClock(), fakeIdGenerator());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW })).rejects.toBeInstanceOf(SubmissionDeadlinePassedError);
  });

  it("refuses a fresh record while a submission is already SUBMITTED/RECEIPT_CONFIRMED — must use replace instead", async () => {
    const existing = TenderSubmission.record({ id: "sub-existing", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), submittedByUserId: "user-1", submittedAt: NOW, platform: SubmissionPlatform.Place, occurredAt: NOW });
    const useCase = new RecordTenderSubmissionUseCase(fakeAccessService(), resolverWith([completedPackage()]), inMemoryRepository(existing), fakeAuditLogWriter(), fakeClock(), fakeIdGenerator());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW })).rejects.toBeInstanceOf(ActiveTenderSubmissionAlreadyExistsError);
  });

  it("completes a SUBMISSION_IN_PROGRESS row in place (READY_FOR_SUBMISSION -> SUBMITTED transition)", async () => {
    const started = TenderSubmission.start({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), startedByUserId: "user-1", platform: SubmissionPlatform.Place, occurredAt: NOW });
    const repository = inMemoryRepository(started);
    const useCase = new RecordTenderSubmissionUseCase(fakeAccessService(), resolverWith([completedPackage()]), repository, fakeAuditLogWriter(), fakeClock(), fakeIdGenerator());

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.AwsAchat, submittedAt: NOW });

    expect(result.id).toBe("sub-1");
    expect(result.status).toBe(TenderSubmissionStatus.Submitted);
    expect(repository.save).toHaveBeenCalledOnce();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("refuses to complete an IN_PROGRESS row with a DIFFERENT package than the one pinned at start", async () => {
    const started = TenderSubmission.start({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), startedByUserId: "user-1", platform: SubmissionPlatform.Place, occurredAt: NOW });
    const useCase = new RecordTenderSubmissionUseCase(fakeAccessService(), resolverWith([completedPackage({ id: "pkg-2" })]), inMemoryRepository(started), fakeAuditLogWriter(), fakeClock(), fakeIdGenerator());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: NOW })).rejects.toBeInstanceOf(SubmissionPackageVersionMismatchError);
  });

  it("mission §29 (correctif audit Codex P1) — refuses to complete a SUBMISSION_IN_PROGRESS deposit if the pinned package became obsolete since start (a newer COMPLETED version now exists)", async () => {
    const started = TenderSubmission.start({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), startedByUserId: "user-1", platform: SubmissionPlatform.Place, occurredAt: NOW });
    const stalePinned = completedPackage({ id: "pkg-1", version: 1 });
    const newerGeneratedSinceStart = completedPackage({ id: "pkg-2", version: 2 });
    const useCase = new RecordTenderSubmissionUseCase(fakeAccessService(), resolverWith([stalePinned, newerGeneratedSinceStart]), inMemoryRepository(started), fakeAuditLogWriter(), fakeClock(), fakeIdGenerator());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW })).rejects.toBeInstanceOf(SubmissionPackageOutdatedError);
  });
});
