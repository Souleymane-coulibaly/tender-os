import { describe, expect, it, vi } from "vitest";
import { ReplaceTenderSubmissionUseCase } from "./replace-tender-submission.use-case";
import type { GetTenderSubmissionReadinessUseCase } from "./get-tender-submission-readiness.use-case";
import { TenderSubmission } from "../../domain/tender-submission.aggregate";
import { ResponsePackageArtifactMissingError, SubmissionDeadlinePassedError, TenderNotReadyForSubmissionError, TenderSubmissionAlreadyReplacedError, TenderSubmissionNotFoundError } from "../../domain/errors";
import { SubmissionPlatform } from "../../domain/submission-platform";
import type { SubmissionReadinessReason } from "../../domain/submission-readiness-reason";
import { TenderSubmissionStatus } from "../../domain/tender-submission-status";
import type { AuditLogWriter } from "../ports/audit-log-writer";
import type { TenderSubmissionRepository } from "../ports/tender-submission.repository";
import type { SubmissionAccessService } from "../services/submission-access.service";
import { SubmissionPackageResolverService } from "../services/submission-package-resolver.service";
import { PackageFileSourceType, PackageStatus, type ListSubmissionPackagesUseCase, type SubmissionPackageSummary } from "../../../submission-package";
import type { GetResponsePackageFreshnessUseCase, GetSubmittableResponsePackageVersionUseCase, SubmittableResponsePackageVersionResolution } from "../../../response-package";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const LATER = new Date("2026-09-11T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";
const MANIFEST_FILE = { archivePath: "manifest.json", sourceType: PackageFileSourceType.Manifest, fileName: "manifest.json", mimeType: "application/json", fileSize: 128, fileHash: "m".repeat(64), order: 0 };

function fakeClock(now = LATER) {
  return { now: () => now };
}
function fakeAccessService(input: { submissionDeadline?: string; candidateCompanyId?: string | undefined } = {}): SubmissionAccessService {
  const candidateCompanyId = "candidateCompanyId" in input ? input.candidateCompanyId : "candidate-1";
  return { assertTenderAccess: vi.fn(async () => ({ clientAccountId: "client-1", submissionDeadline: input.submissionDeadline, candidateCompanyId }) as never) } as unknown as SubmissionAccessService;
}
// Checkpoint TENDEROS-2.1-P2.2-F2.3.1 — par défaut "dossier complet" (aucune raison, jamais
// bloquant), même motif que `record-tender-submission.use-case.spec.ts`, pour que les tests
// existants (qui n'exercent PAS cette dimension) restent inchangés.
function fakeReadinessUseCase(reasons: readonly SubmissionReadinessReason[] = []): GetTenderSubmissionReadinessUseCase {
  return { resolveFileReadinessReasons: vi.fn(async () => reasons) } as unknown as GetTenderSubmissionReadinessUseCase;
}
function fakeAuditLogWriter(): AuditLogWriter {
  return { record: vi.fn(async () => undefined) };
}
// Checkpoint TENDEROS-2.1-P2.2-F4.1 — même motif que `record-tender-submission.use-case.spec.ts` :
// provenance V2 PARTAGÉE par défaut entre le fixture de package et la résolution V2 fictive, pour
// que ce fichier continue à tester `ReplaceTenderSubmissionUseCase` sans re-tester le contrôle
// d'alignement V2 de `SubmissionPackageResolverService` lui-même.
const DEFAULT_V2_VERSION_ID = "rpv-default";
const DEFAULT_V2_ARTIFACT_ID = "art-default";
function completedPackage(overrides: Partial<SubmissionPackageSummary> = {}): SubmissionPackageSummary {
  return {
    id: "pkg-2",
    tenderId: TENDER_ID,
    version: 2,
    status: PackageStatus.Completed,
    validationRunId: "run-1",
    approvalId: "approval-1",
    readinessStatus: "READY_FOR_SUBMISSION",
    files: [MANIFEST_FILE],
    fileHash: "b".repeat(64),
    responsePackageVersionId: DEFAULT_V2_VERSION_ID,
    responsePackageArtifactId: DEFAULT_V2_ARTIFACT_ID,
    responsePackages: [],
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}
function resolverWith(packages: readonly SubmissionPackageSummary[]): SubmissionPackageResolverService {
  const listUseCase = { execute: vi.fn(async () => packages) } as unknown as ListSubmissionPackagesUseCase;
  const getSubmittableResponsePackageVersionUseCase = {
    execute: vi.fn(async () => ({
      status: "RESOLVED",
      responsePackageId: "rp-default",
      responsePackageVersionId: DEFAULT_V2_VERSION_ID,
      versionNumber: 1,
      artifactId: DEFAULT_V2_ARTIFACT_ID,
      artifactChecksum: "c".repeat(64),
      artifactFileName: "V2.zip",
      artifactStorageKey: "storage/v2.zip",
      artifactMimeType: "application/zip",
      artifactSizeBytes: 2048,
    })),
  } as unknown as GetSubmittableResponsePackageVersionUseCase;
  const getResponsePackageFreshnessUseCase = { execute: vi.fn(async () => ({ freshness: "CURRENT", currentVersionId: DEFAULT_V2_VERSION_ID, currentVersionNumber: 1 })) } as unknown as GetResponsePackageFreshnessUseCase;
  return new SubmissionPackageResolverService(listUseCase, getSubmittableResponsePackageVersionUseCase, getResponsePackageFreshnessUseCase);
}
function original() {
  return TenderSubmission.record({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), submittedByUserId: "user-1", submittedAt: NOW, platform: SubmissionPlatform.Place, occurredAt: NOW });
}
function repositoryWith(submission: TenderSubmission | null): TenderSubmissionRepository {
  return { create: vi.fn(), findById: vi.fn(async () => submission), findActiveForTender: vi.fn(), listByTender: vi.fn(), save: vi.fn(), replaceActive: vi.fn(async () => undefined), listResponsePackageProvenance: vi.fn(async () => []) };
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
  readinessUseCase?: GetTenderSubmissionReadinessUseCase;
  repository: TenderSubmissionRepository;
  submittableResponsePackageVersionUseCase?: GetSubmittableResponsePackageVersionUseCase;
  idGenerator?: { generate: () => string };
  entitlementService?: ReturnType<typeof fakeEntitlementService>;
}): ReplaceTenderSubmissionUseCase {
  return new ReplaceTenderSubmissionUseCase(
    input.accessService ?? fakeAccessService(),
    input.resolver,
    input.readinessUseCase ?? fakeReadinessUseCase(),
    input.submittableResponsePackageVersionUseCase ?? fakeSubmittableResponsePackageVersionUseCase(),
    input.repository,
    fakeAuditLogWriter(),
    fakeClock(),
    input.idGenerator ?? { generate: () => "sub-2" },
    (input.entitlementService ?? fakeEntitlementService()) as never,
  );
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
    expect(repository.replaceActive).toHaveBeenCalledWith({ previous, next: expect.objectContaining({ id: "sub-2" }), nextResponsePackageProvenance: [] });
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
    const useCase = buildUseCase({ accessService: fakeAccessService({ submissionDeadline: "2020-01-01T00:00:00.000Z" }), resolver: resolverWith([completedPackage()]), repository: repositoryWith(original()) });
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: LATER })).rejects.toBeInstanceOf(SubmissionDeadlinePassedError);
  });

  describe("Checkpoint TENDEROS-2.1-P2.2-F2.3.1 — replace consomme l'autorité Submission Readiness backend (ferme le P1 identifié par l'audit F2.3)", () => {
    it("TEST 2 — refuses a replacement when the readiness authority reports a BLOCKING reason (e.g. Analysis STALE), carrying the reasons on the error", async () => {
      const blocking: SubmissionReadinessReason = { code: "ANALYSIS_STALE", severity: "BLOCKING", source: "ANALYSIS", message: "L'analyse du DCE n'est plus à jour." };
      const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository: repositoryWith(original()), readinessUseCase: fakeReadinessUseCase([blocking]) });

      const call = useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: LATER });
      await expect(call).rejects.toBeInstanceOf(TenderNotReadyForSubmissionError);
      await expect(call.catch((error: TenderNotReadyForSubmissionError) => error.reasons)).resolves.toEqual([blocking]);
    });

    it("TEST 3 — refuses a replacement when the Candidate is missing (readiness authority, not a locally-recomputed check)", async () => {
      const blocking: SubmissionReadinessReason = { code: "CANDIDATE_MISSING", severity: "BLOCKING", source: "CANDIDATE", message: "Aucune entreprise candidate n'est résolue pour ce dossier." };
      const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository: repositoryWith(original()), readinessUseCase: fakeReadinessUseCase([blocking]) });
      await expect(
        useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: LATER }),
      ).rejects.toBeInstanceOf(TenderNotReadyForSubmissionError);
    });

    it("TEST 4 — refuses a replacement when Checklist is STALE (reconciliation required)", async () => {
      const blocking: SubmissionReadinessReason = { code: "CHECKLIST_STALE", severity: "BLOCKING", source: "CHECKLIST", message: "La checklist n'a pas été réconciliée avec la dernière analyse." };
      const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository: repositoryWith(original()), readinessUseCase: fakeReadinessUseCase([blocking]) });
      await expect(
        useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: LATER }),
      ).rejects.toBeInstanceOf(TenderNotReadyForSubmissionError);
    });

    it("TEST 5 — refuses a replacement when the Technical Memo is STALE", async () => {
      const blocking: SubmissionReadinessReason = { code: "TECHNICAL_MEMO_STALE", severity: "BLOCKING", source: "TECHNICAL_MEMO", message: "Le mémoire technique n'est plus à jour." };
      const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository: repositoryWith(original()), readinessUseCase: fakeReadinessUseCase([blocking]) });
      await expect(
        useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: LATER }),
      ).rejects.toBeInstanceOf(TenderNotReadyForSubmissionError);
    });

    it("TEST 6 — refuses a replacement when Validation is STALE", async () => {
      const blocking: SubmissionReadinessReason = { code: "VALIDATION_STALE", severity: "BLOCKING", source: "VALIDATION", message: "L'approbation finale active n'est plus à jour." };
      const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository: repositoryWith(original()), readinessUseCase: fakeReadinessUseCase([blocking]) });
      await expect(
        useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: LATER }),
      ).rejects.toBeInstanceOf(TenderNotReadyForSubmissionError);
    });

    it("TEST 7 — refuses a replacement when the Response Package is STALE", async () => {
      const blocking: SubmissionReadinessReason = { code: "RESPONSE_PACKAGE_STALE", severity: "BLOCKING", source: "RESPONSE_PACKAGE", message: "Le dossier de réponse final n'est plus à jour." };
      const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository: repositoryWith(original()), readinessUseCase: fakeReadinessUseCase([blocking]) });
      await expect(
        useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: LATER }),
      ).rejects.toBeInstanceOf(TenderNotReadyForSubmissionError);
    });

    it("TEST 9 — a WARNING-only reason (e.g. GO/NO-GO = NO_GO) never blocks the replacement", async () => {
      const warningOnly: SubmissionReadinessReason = { code: "GONOGO_NO_GO", severity: "WARNING", source: "GO_NO_GO", message: "La dernière recommandation GO/NO-GO était NO-GO." };
      const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository: repositoryWith(original()), readinessUseCase: fakeReadinessUseCase([warningOnly]) });
      const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: LATER });
      expect(result.status).toBe(TenderSubmissionStatus.Submitted);
    });

    it("TEST 1 — a genuinely READY dossier (readiness clean + legacy package valid + deadline valid) succeeds", async () => {
      const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository: repositoryWith(original()) });
      const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: LATER });
      expect(result.status).toBe(TenderSubmissionStatus.Submitted);
    });

    it("preserves the legacy deadline guard even when the readiness authority reports zero blocking reasons", async () => {
      const useCase = buildUseCase({ accessService: fakeAccessService({ submissionDeadline: "2020-01-01T00:00:00.000Z" }), resolver: resolverWith([completedPackage()]), repository: repositoryWith(original()), readinessUseCase: fakeReadinessUseCase([]) });
      await expect(
        useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: LATER }),
      ).rejects.toBeInstanceOf(SubmissionDeadlinePassedError);
    });
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
          artifactStorageKey: "storage/artifact-2.zip",
          artifactMimeType: "application/zip",
          artifactSizeBytes: 4096,
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

  describe("Checkpoint TENDEROS-2.1-P2.3-E1.2 — entitlement gate (mission TEST 9/10)", () => {
    it("mission TEST 9 — refuses (no mutation, history untouched) when the organization has no entitlement to operate on this tender", async () => {
      const entitlementService = fakeEntitlementService(false);
      const repository = repositoryWith(original());
      const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository, entitlementService });

      await expect(
        useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: LATER }),
      ).rejects.toMatchObject({ code: "TENDER_OPERATION_NOT_ENTITLED" });

      expect(entitlementService.runTenderOperationEntitled).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORGANIZATION_ID, tenderId: TENDER_ID }), expect.any(Function));
      expect(repository.replaceActive).not.toHaveBeenCalled();
    });

    it("mission TEST 10 — succeeds when entitled, and never consumes an additional AO credit (ConsumeAoCreditUseCase is never wired into this use case)", async () => {
      const entitlementService = fakeEntitlementService(true);
      const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository: repositoryWith(original()), entitlementService });

      const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", submissionId: "sub-1", packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: LATER });

      expect(result.status).toBe(TenderSubmissionStatus.Submitted);
      expect(entitlementService.runTenderOperationEntitled).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORGANIZATION_ID, tenderId: TENDER_ID }), expect.any(Function));
    });
  });
});
