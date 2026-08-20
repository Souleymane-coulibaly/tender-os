import { describe, expect, it, vi } from "vitest";
import { ReplaceTenderSubmissionUseCase } from "./replace-tender-submission.use-case";
import { TenderSubmission } from "../../domain/tender-submission.aggregate";
import { ResponsePackageArtifactMissingError, SubmissionDeadlinePassedError, TenderSubmissionAlreadyReplacedError, TenderSubmissionNotFoundError } from "../../domain/errors";
import { SubmissionPlatform } from "../../domain/submission-platform";
import { TenderSubmissionStatus } from "../../domain/tender-submission-status";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { TenderSubmissionRepository } from "../ports/tender-submission.repository";
import type { SubmissionAccessService } from "../services/submission-access.service";
import { SubmissionPackageResolverService } from "../services/submission-package-resolver.service";
import { PackageFileSourceType, PackageStatus, type ListSubmissionPackagesUseCase, type SubmissionPackageSummary } from "../../../submission-package";
import type { GetSubmittableResponsePackageVersionUseCase, SubmittableResponsePackageVersionResolution } from "../../../response-package";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const LATER = new Date("2026-09-11T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";
const MANIFEST_FILE = { archivePath: "manifest.json", sourceType: PackageFileSourceType.Manifest, fileName: "manifest.json", mimeType: "application/json", fileSize: 128, fileHash: "m".repeat(64), order: 0 };

function fakeClock(now = LATER) {
  return { now: () => now };
}
function fakeAccessService(submissionDeadline?: string): SubmissionAccessService {
  return { assertTenderAccess: vi.fn(async () => ({ clientAccountId: "client-1", submissionDeadline }) as never) } as unknown as SubmissionAccessService;
}
function fakeAuditLogWriter(): AuditLogWriter {
  return { record: vi.fn(async () => undefined) };
}
function completedPackage(overrides: Partial<SubmissionPackageSummary> = {}): SubmissionPackageSummary {
  return { id: "pkg-2", tenderId: TENDER_ID, version: 2, status: PackageStatus.Completed, validationRunId: "run-1", approvalId: "approval-1", readinessStatus: "READY_FOR_SUBMISSION", files: [MANIFEST_FILE], fileHash: "b".repeat(64), createdAt: NOW.toISOString(), ...overrides };
}
function resolverWith(packages: readonly SubmissionPackageSummary[]): SubmissionPackageResolverService {
  return new SubmissionPackageResolverService({ execute: vi.fn(async () => packages) } as unknown as ListSubmissionPackagesUseCase);
}
function original() {
  return TenderSubmission.record({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), submittedByUserId: "user-1", submittedAt: NOW, platform: SubmissionPlatform.Place, occurredAt: NOW });
}
function repositoryWith(submission: TenderSubmission | null): TenderSubmissionRepository {
  return { create: vi.fn(), findById: vi.fn(async () => submission), findActiveForTender: vi.fn(), listByTender: vi.fn(), save: vi.fn(), replaceActive: vi.fn(async () => undefined) };
}
// Checkpoint TENDEROS-2.1-P2.2-F2.1 — par défaut "aucun dossier V2 résolvable sans ambiguïté", pour
// que les tests existants (qui n'exercent PAS cette provenance) restent inchangés, même motif que
// `record-tender-submission.use-case.spec.ts`.
function fakeSubmittableResponsePackageVersionUseCase(
  result: SubmittableResponsePackageVersionResolution = { status: "AMBIGUOUS_OR_ABSENT" },
): GetSubmittableResponsePackageVersionUseCase {
  return { execute: vi.fn(async () => result) } as unknown as GetSubmittableResponsePackageVersionUseCase;
}
function buildUseCase(input: {
  accessService?: SubmissionAccessService;
  resolver: SubmissionPackageResolverService;
  repository: TenderSubmissionRepository;
  submittableResponsePackageVersionUseCase?: GetSubmittableResponsePackageVersionUseCase;
  idGenerator?: { generate: () => string };
}): ReplaceTenderSubmissionUseCase {
  return new ReplaceTenderSubmissionUseCase(
    input.accessService ?? fakeAccessService(),
    input.resolver,
    input.submittableResponsePackageVersionUseCase ?? fakeSubmittableResponsePackageVersionUseCase(),
    input.repository,
    fakeAuditLogWriter(),
    fakeClock(),
    input.idGenerator ?? { generate: () => "sub-2" },
  );
}

describe("ReplaceTenderSubmissionUseCase", () => {
  it("creates a new submission linked to the old one, and marks the old one REPLACED — never overwriting its package reference", async () => {
    const previous = original();
    const repository = repositoryWith(previous);
    const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository });

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", packageId: "pkg-2", platform: SubmissionPlatform.AwsAchat, submittedAt: LATER });

    expect(result.id).toBe("sub-2");
    expect(result.packageId).toBe("pkg-2");
    expect(result.supersedesSubmissionId).toBe("sub-1");
    expect(previous.status).toBe(TenderSubmissionStatus.Replaced);
    expect(previous.replacedBySubmissionId).toBe("sub-2");
    expect(previous.packageId).toBe("pkg-1"); // l'ancienne référence reste intacte, jamais écrasée
    expect(result.manifestHash).toBe(MANIFEST_FILE.fileHash); // correctif audit Codex P1 — jamais laissé non alimenté
    expect(repository.replaceActive).toHaveBeenCalledWith({ previous, next: expect.objectContaining({ id: "sub-2" }) });
  });

  it("throws NotFound for an unknown submission id", async () => {
    const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository: repositoryWith(null) });
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "missing", packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: LATER })).rejects.toBeInstanceOf(TenderSubmissionNotFoundError);
  });

  it("refuses to replace a submission that is already REPLACED", async () => {
    const previous = original();
    previous.markReplaced({ replacedBySubmissionId: "sub-already-next", occurredAt: NOW });
    const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository: repositoryWith(previous), idGenerator: { generate: () => "sub-3" } });
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: LATER })).rejects.toBeInstanceOf(TenderSubmissionAlreadyReplacedError);
  });

  it("refuses a replacement recorded after the deadline", async () => {
    const useCase = buildUseCase({ accessService: fakeAccessService("2020-01-01T00:00:00.000Z"), resolver: resolverWith([completedPackage()]), repository: repositoryWith(original()) });
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: LATER })).rejects.toBeInstanceOf(SubmissionDeadlinePassedError);
  });

  describe("Checkpoint TENDEROS-2.1-P2.2-F2.1 — Response Package V2 provenance (ferme le gap identifié par l'audit F2)", () => {
    it("captures the resolved ResponsePackageVersion/artifact/checksum on the NEW submission when resolvable", async () => {
      const previous = original();
      const useCase = buildUseCase({
        resolver: resolverWith([completedPackage()]),
        repository: repositoryWith(previous),
        submittableResponsePackageVersionUseCase: fakeSubmittableResponsePackageVersionUseCase({
          status: "RESOLVED",
          responsePackageId: "rp-1",
          responsePackageVersionId: "rpv-2",
          versionNumber: 2,
          artifactId: "artifact-2",
          artifactChecksum: "d".repeat(64),
          artifactFileName: "TenderOS_tender-1_V2.zip",
        }),
      });

      const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: LATER });

      expect(result.responsePackageVersionId).toBe("rpv-2");
      expect(result.responsePackageArtifactId).toBe("artifact-2");
      expect(result.responsePackageArtifactChecksum).toBe("d".repeat(64));
    });

    it("never blocks the legacy replacement when the V2 dossier is not resolvable without ambiguity, leaves the new provenance fields empty", async () => {
      const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository: repositoryWith(original()) });
      const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: LATER });
      expect(result.responsePackageVersionId).toBeUndefined();
      expect(result.responsePackageArtifactId).toBeUndefined();
      expect(result.responsePackageArtifactChecksum).toBeUndefined();
    });

    it("refuses cleanly (no new Submission persisted) when the V2 dossier resolves without ambiguity but has no generated artifact", async () => {
      const repository = repositoryWith(original());
      const useCase = buildUseCase({
        resolver: resolverWith([completedPackage()]),
        repository,
        submittableResponsePackageVersionUseCase: fakeSubmittableResponsePackageVersionUseCase({ status: "ARTIFACT_MISSING", responsePackageId: "rp-1", responsePackageVersionId: "rpv-2" }),
      });
      await expect(
        useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: LATER }),
      ).rejects.toBeInstanceOf(ResponsePackageArtifactMissingError);
      expect(repository.replaceActive).not.toHaveBeenCalled();
    });
  });
});
