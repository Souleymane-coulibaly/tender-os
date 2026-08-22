import { describe, expect, it, vi } from "vitest";
import { StartTenderSubmissionUseCase } from "./start-tender-submission.use-case";
import { ActiveTenderSubmissionAlreadyExistsError } from "../../domain/errors";
import { SubmissionPlatform } from "../../domain/submission-platform";
import { TenderSubmissionStatus } from "../../domain/tender-submission-status";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { TenderSubmissionRepository } from "../ports/tender-submission.repository";
import type { SubmissionAccessService } from "../services/submission-access.service";
import { SubmissionPackageResolverService } from "../services/submission-package-resolver.service";
import { PackageFileSourceType, PackageStatus, type ListSubmissionPackagesUseCase, type SubmissionPackageSummary } from "../../../submission-package";
import type { GetResponsePackageFreshnessUseCase, GetSubmittableResponsePackageVersionUseCase } from "../../../response-package";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";
const MANIFEST_FILE = { archivePath: "manifest.json", sourceType: PackageFileSourceType.Manifest, fileName: "manifest.json", mimeType: "application/json", fileSize: 128, fileHash: "m".repeat(64), order: 0 };

function fakeClock() {
  return { now: () => NOW };
}
function fakeIdGenerator(id = "sub-1") {
  return { generate: () => id };
}
function fakeAccessService(): SubmissionAccessService {
  return { assertTenderAccess: vi.fn(async () => ({ clientAccountId: "client-1" }) as never) } as unknown as SubmissionAccessService;
}
function fakeAuditLogWriter(): AuditLogWriter {
  return { record: vi.fn(async () => undefined) };
}
function completedPackage(overrides: Partial<SubmissionPackageSummary> = {}): SubmissionPackageSummary {
  return {
    id: "pkg-1",
    tenderId: TENDER_ID,
    version: 1,
    status: PackageStatus.Completed,
    validationRunId: "run-1",
    approvalId: "approval-1",
    readinessStatus: "READY_FOR_SUBMISSION",
    files: [MANIFEST_FILE],
    fileHash: "a".repeat(64),
    responsePackages: [],
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}
function resolverWith(packages: readonly SubmissionPackageSummary[]): SubmissionPackageResolverService {
  const listUseCase = { execute: vi.fn(async () => packages) } as unknown as ListSubmissionPackagesUseCase;
  // `resolveExactPackage` exige "RESOLVED"/"RESOLVED_MULTI_LOT" pour ne jamais lever
  // SubmissionPackageOutdatedError (voir submission-package-resolver.service.ts:77-79) — le champ
  // `responsePackageId` doit matcher `completedPackage()` (responsePackageVersionId/
  // responsePackageArtifactId tous deux `undefined`, mode GLOBAL) pour que la comparaison de
  // provenance à la ligne 62 passe.
  const getSubmittableResponsePackageVersionUseCase = {
    execute: vi.fn(async () => ({
      status: "RESOLVED",
      responsePackageId: "rpv-1",
      responsePackageVersionId: undefined,
      versionNumber: 1,
      artifactId: undefined,
      artifactChecksum: "c".repeat(64),
      artifactFileName: "package.zip",
      artifactStorageKey: "response-packages/rpv-1.zip",
      artifactMimeType: "application/zip",
      artifactSizeBytes: 2048,
    })),
  } as unknown as GetSubmittableResponsePackageVersionUseCase;
  const getResponsePackageFreshnessUseCase = { execute: vi.fn(async () => ({ freshness: "CURRENT", currentVersionId: "rpv-1", currentVersionNumber: 1 })) } as unknown as GetResponsePackageFreshnessUseCase;
  return new SubmissionPackageResolverService(listUseCase, getSubmittableResponsePackageVersionUseCase, getResponsePackageFreshnessUseCase);
}
function inMemoryRepository(seed: null = null): TenderSubmissionRepository {
  let active = seed as unknown;
  return {
    create: vi.fn(async (s) => {
      active = s;
    }),
    findById: vi.fn(),
    findActiveForTender: vi.fn(async () => active as never),
    listByTender: vi.fn(),
    save: vi.fn(),
    replaceActive: vi.fn(),
    listResponsePackageProvenance: vi.fn(async () => []),
  };
}

function fakeEntitlementService(allowed = true) {
  return {
    canOperateOnTender: vi.fn(async () => allowed),
    runTenderOperationEntitled: vi.fn(async (_input: unknown, operation: () => Promise<unknown>) => {
      if (!allowed) {
        throw Object.assign(new Error("not entitled"), { code: "TENDER_OPERATION_NOT_ENTITLED" });
      }
      return operation();
    }),
  };
}

function buildUseCase(input: { repository: TenderSubmissionRepository; entitlementService?: ReturnType<typeof fakeEntitlementService> }): StartTenderSubmissionUseCase {
  return new StartTenderSubmissionUseCase(
    fakeAccessService(),
    resolverWith([completedPackage()]),
    input.repository,
    fakeAuditLogWriter(),
    fakeClock(),
    fakeIdGenerator(),
    (input.entitlementService ?? fakeEntitlementService()) as never,
  );
}

/** Checkpoint TENDEROS-2.1-P2.3-E1.2 — ferme le finding Codex "Submission.start non entitlement-
 *  gated" (aucun test unitaire n'existait avant ce Checkpoint, seule la suite HTTP l'exerçait). */
describe("StartTenderSubmissionUseCase", () => {
  it("creates a SUBMISSION_IN_PROGRESS row when authorized", async () => {
    const repository = inMemoryRepository();
    const useCase = buildUseCase({ repository });

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place });

    expect(result.status).toBe(TenderSubmissionStatus.SubmissionInProgress);
    expect(repository.create).toHaveBeenCalledOnce();
  });

  it("mission TEST 7 — refuses (no Submission created) when the organization has no entitlement to operate on this tender", async () => {
    const entitlementService = fakeEntitlementService(false);
    const repository = inMemoryRepository();
    const useCase = buildUseCase({ repository, entitlementService });

    await expect(
      useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place }),
    ).rejects.toMatchObject({ code: "TENDER_OPERATION_NOT_ENTITLED" });

    expect(entitlementService.runTenderOperationEntitled).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORGANIZATION_ID, tenderId: TENDER_ID }), expect.any(Function));
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("mission TEST 8 — succeeds when entitled", async () => {
    const entitlementService = fakeEntitlementService(true);
    const repository = inMemoryRepository();
    const useCase = buildUseCase({ repository, entitlementService });

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place });

    expect(result.status).toBe(TenderSubmissionStatus.SubmissionInProgress);
  });

  it("the entitlement gate runs BEFORE the active-submission check (never leaks whether a submission already exists to an unauthorized caller)", async () => {
    const entitlementService = fakeEntitlementService(false);
    const repository = inMemoryRepository();
    repository.findActiveForTender = vi.fn(async () => {
      throw new Error("findActiveForTender should never be reached when the organization is not entitled");
    });
    const useCase = buildUseCase({ repository, entitlementService });

    await expect(
      useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place }),
    ).rejects.toMatchObject({ code: "TENDER_OPERATION_NOT_ENTITLED" });
  });

  it("still refuses a double trigger for the same tender once entitled (unchanged from before this checkpoint)", async () => {
    const repository = inMemoryRepository();
    const useCase = buildUseCase({ repository });
    await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place });

    await expect(
      useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place }),
    ).rejects.toBeInstanceOf(ActiveTenderSubmissionAlreadyExistsError);
  });
});
