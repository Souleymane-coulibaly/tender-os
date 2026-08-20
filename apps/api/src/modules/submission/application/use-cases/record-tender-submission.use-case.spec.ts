import { describe, expect, it, vi } from "vitest";
import { RecordTenderSubmissionUseCase } from "./record-tender-submission.use-case";
import type { GetTenderSubmissionReadinessUseCase } from "./get-tender-submission-readiness.use-case";
import type { GetSubmittableResponsePackageVersionUseCase, SubmittableResponsePackageVersion, SubmittableResponsePackageVersionResolution } from "../../../response-package";
import { TenderSubmission } from "../../domain/tender-submission.aggregate";
import {
  ActiveTenderSubmissionAlreadyExistsError,
  CustomPlatformNameRequiredError,
  ResponsePackageArtifactMissingError,
  SubmissionDeadlinePassedError,
  SubmissionPackageMissingError,
  SubmissionPackageOutdatedError,
  SubmissionPackageVersionMismatchError,
  TenderNotReadyForSubmissionError,
} from "../../domain/errors";
import type { SubmissionReadinessReason } from "../../domain/submission-readiness-reason";
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
// Checkpoint 2.1-P2.1-FIX-F.1 — par défaut "dossier complet" (aucune raison, jamais bloquant), pour
// que les tests existants (qui exercent d'AUTRES guards) restent inchangés. Un test dédié fournit
// des raisons BLOCKING pour prouver le NOUVEAU guard, sans dupliquer la logique de classification
// (déjà prouvée par `evaluate-file-readiness.spec.ts`) — ici on teste uniquement le CÂBLAGE.
function fakeReadinessUseCase(reasons: readonly SubmissionReadinessReason[] = []): { useCase: GetTenderSubmissionReadinessUseCase; resolveSpy: ReturnType<typeof vi.fn> } {
  const resolveSpy = vi.fn(async () => reasons);
  return { useCase: { resolveFileReadinessReasons: resolveSpy } as unknown as GetTenderSubmissionReadinessUseCase, resolveSpy };
}
// Checkpoint TENDEROS-2.1-P2.2-F2 — par défaut "aucun dossier V2 résolvable sans ambiguïté"
// (`AMBIGUOUS_OR_ABSENT`, jamais bloquant en soi — voir `record-tender-submission.use-case.ts`),
// pour que les tests existants (qui n'exercent PAS cette provenance) restent inchangés. Des tests
// dédiés fournissent `RESOLVED`/`ARTIFACT_MISSING` pour prouver le câblage, sans dupliquer la
// logique de résolution elle-même (déjà prouvée par ses propres tests dans `response-package`).
function fakeSubmittableResponsePackageVersionUseCase(
  result: SubmittableResponsePackageVersionResolution = { status: "AMBIGUOUS_OR_ABSENT" },
): GetSubmittableResponsePackageVersionUseCase {
  return { execute: vi.fn(async () => result) } as unknown as GetSubmittableResponsePackageVersionUseCase;
}
function buildUseCase(input: {
  accessService?: SubmissionAccessService;
  resolver: SubmissionPackageResolverService;
  repository: TenderSubmissionRepository;
  readinessUseCase?: GetTenderSubmissionReadinessUseCase;
  submittableResponsePackageVersionUseCase?: GetSubmittableResponsePackageVersionUseCase;
}): RecordTenderSubmissionUseCase {
  return new RecordTenderSubmissionUseCase(
    input.accessService ?? fakeAccessService(),
    input.resolver,
    input.readinessUseCase ?? fakeReadinessUseCase().useCase,
    input.submittableResponsePackageVersionUseCase ?? fakeSubmittableResponsePackageVersionUseCase(),
    input.repository,
    fakeAuditLogWriter(),
    fakeClock(),
    fakeIdGenerator(),
  );
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
    const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository });

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW });

    expect(result.status).toBe(TenderSubmissionStatus.Submitted);
    expect(result.packageId).toBe("pkg-1");
    expect(repository.create).toHaveBeenCalledOnce();
  });

  it("mission §18/§29 (correctif audit Codex P1) — resolves and persists the manifest's own hash, never left empty", async () => {
    const repository = inMemoryRepository();
    const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository });

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW });

    expect(result.manifestHash).toBe(MANIFEST_FILE.fileHash);
  });

  it("mission §29 (correctif audit Codex P1) — refuses a package with no manifest.json entry at all, never fabricating a hash", async () => {
    const packageWithoutManifest = completedPackage({ files: [] });
    const useCase = buildUseCase({ resolver: resolverWith([packageWithoutManifest]), repository: inMemoryRepository() });
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW })).rejects.toBeInstanceOf(SubmissionPackageMissingError);
  });

  it("refuses a package that is no longer the latest COMPLETED version", async () => {
    const older = completedPackage({ id: "pkg-old", version: 1 });
    const newer = completedPackage({ id: "pkg-new", version: 2 });
    const useCase = buildUseCase({ resolver: resolverWith([older, newer]), repository: inMemoryRepository() });

    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-old", platform: SubmissionPlatform.Place, submittedAt: NOW })).rejects.toBeInstanceOf(SubmissionPackageOutdatedError);
  });

  it("refuses a package that does not exist or is not COMPLETED", async () => {
    const useCase = buildUseCase({ resolver: resolverWith([]), repository: inMemoryRepository() });
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "missing", platform: SubmissionPlatform.Place, submittedAt: NOW })).rejects.toBeInstanceOf(SubmissionPackageMissingError);
  });

  it("refuses OTHER platform without a custom name", async () => {
    const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository: inMemoryRepository() });
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Other, submittedAt: NOW })).rejects.toBeInstanceOf(CustomPlatformNameRequiredError);
  });

  it("refuses a submission recorded after the deadline, never silently", async () => {
    const useCase = buildUseCase({ accessService: fakeAccessService("2020-01-01T00:00:00.000Z"), resolver: resolverWith([completedPackage()]), repository: inMemoryRepository() });
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW })).rejects.toBeInstanceOf(SubmissionDeadlinePassedError);
  });

  it("refuses a fresh record while a submission is already SUBMITTED/RECEIPT_CONFIRMED — must use replace instead", async () => {
    const existing = TenderSubmission.record({ id: "sub-existing", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), submittedByUserId: "user-1", submittedAt: NOW, platform: SubmissionPlatform.Place, occurredAt: NOW });
    const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository: inMemoryRepository(existing) });
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW })).rejects.toBeInstanceOf(ActiveTenderSubmissionAlreadyExistsError);
  });

  it("completes a SUBMISSION_IN_PROGRESS row in place (READY_FOR_SUBMISSION -> SUBMITTED transition)", async () => {
    const started = TenderSubmission.start({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), startedByUserId: "user-1", platform: SubmissionPlatform.Place, occurredAt: NOW });
    const repository = inMemoryRepository(started);
    const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository });

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.AwsAchat, submittedAt: NOW });

    expect(result.id).toBe("sub-1");
    expect(result.status).toBe(TenderSubmissionStatus.Submitted);
    expect(repository.save).toHaveBeenCalledOnce();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("refuses to complete an IN_PROGRESS row with a DIFFERENT package than the one pinned at start", async () => {
    const started = TenderSubmission.start({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), startedByUserId: "user-1", platform: SubmissionPlatform.Place, occurredAt: NOW });
    const useCase = buildUseCase({ resolver: resolverWith([completedPackage({ id: "pkg-2" })]), repository: inMemoryRepository(started) });
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-2", platform: SubmissionPlatform.Place, submittedAt: NOW })).rejects.toBeInstanceOf(SubmissionPackageVersionMismatchError);
  });

  it("mission §29 (correctif audit Codex P1) — refuses to complete a SUBMISSION_IN_PROGRESS deposit if the pinned package became obsolete since start (a newer COMPLETED version now exists)", async () => {
    const started = TenderSubmission.start({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), startedByUserId: "user-1", platform: SubmissionPlatform.Place, occurredAt: NOW });
    const stalePinned = completedPackage({ id: "pkg-1", version: 1 });
    const newerGeneratedSinceStart = completedPackage({ id: "pkg-2", version: 2 });
    const useCase = buildUseCase({ resolver: resolverWith([stalePinned, newerGeneratedSinceStart]), repository: inMemoryRepository(started) });
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW })).rejects.toBeInstanceOf(SubmissionPackageOutdatedError);
  });

  describe("Checkpoint 2.1-P2.1-FIX-F.1 — readiness backend obligatoire (ferme le P1 Codex)", () => {
    it("TEST 1 — a BLOCKING reason from the readiness authority refuses the deposit, carrying the reasons on the error", async () => {
      const blocking: SubmissionReadinessReason = { code: "ANALYSIS_STALE", severity: "BLOCKING", source: "ANALYSIS", message: "L'analyse du DCE n'est plus à jour.", action: "REANALYZE_DCE" };
      const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository: inMemoryRepository(), readinessUseCase: fakeReadinessUseCase([blocking]).useCase });

      const call = useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW });
      await expect(call).rejects.toBeInstanceOf(TenderNotReadyForSubmissionError);
      await expect(call.catch((error: TenderNotReadyForSubmissionError) => error.reasons)).resolves.toEqual([blocking]);
    });

    it("TEST 7 — a WARNING-only reason (e.g. GO/NO-GO = NO_GO) never blocks the deposit", async () => {
      const warningOnly: SubmissionReadinessReason = { code: "GONOGO_NO_GO", severity: "WARNING", source: "GO_NO_GO", message: "La dernière recommandation GO/NO-GO était NO-GO." };
      const repository = inMemoryRepository();
      const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository, readinessUseCase: fakeReadinessUseCase([warningOnly]).useCase });

      const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW });
      expect(result.status).toBe(TenderSubmissionStatus.Submitted);
    });

    it("mission §15/§38 (TOCTOU) — the readiness authority is queried fresh on EVERY call, never cached across two invocations of the same use case instance", async () => {
      let currentReasons: SubmissionReadinessReason[] = [];
      const readinessUseCase = { resolveFileReadinessReasons: vi.fn(async () => currentReasons) } as unknown as GetTenderSubmissionReadinessUseCase;
      const useCase = buildUseCase({ resolver: resolverWith([completedPackage()]), repository: inMemoryRepository(), readinessUseCase });

      // T0 — dossier prêt : succès.
      const first = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW });
      expect(first.status).toBe(TenderSubmissionStatus.Submitted);

      // T1 — mutation : la dimension Analyse devient STALE entre les deux appels (jamais un
      // snapshot figé au premier appel).
      currentReasons = [{ code: "ANALYSIS_STALE", severity: "BLOCKING", source: "ANALYSIS", message: "L'analyse du DCE n'est plus à jour." }];

      // T2 — un second dépôt (Tender différent, même use case instance) doit revalider l'état
      // COURANT, jamais réutiliser le résultat mis en cache au premier appel.
      const secondCall = useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: "tender-2", packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW });
      await expect(secondCall).rejects.toBeInstanceOf(TenderNotReadyForSubmissionError);
      expect(readinessUseCase.resolveFileReadinessReasons).toHaveBeenCalledTimes(2);
    });

    it("preserves the legacy deadline guard even when the readiness authority reports zero blocking reasons", async () => {
      const useCase = buildUseCase({ accessService: fakeAccessService("2020-01-01T00:00:00.000Z"), resolver: resolverWith([completedPackage()]), repository: inMemoryRepository(), readinessUseCase: fakeReadinessUseCase([]).useCase });
      await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW })).rejects.toBeInstanceOf(SubmissionDeadlinePassedError);
    });

    it("preserves the legacy outdated-package guard even when the readiness authority reports zero blocking reasons", async () => {
      const older = completedPackage({ id: "pkg-old", version: 1 });
      const newer = completedPackage({ id: "pkg-new", version: 2 });
      const useCase = buildUseCase({ resolver: resolverWith([older, newer]), repository: inMemoryRepository(), readinessUseCase: fakeReadinessUseCase([]).useCase });
      await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-old", platform: SubmissionPlatform.Place, submittedAt: NOW })).rejects.toBeInstanceOf(SubmissionPackageOutdatedError);
    });
  });

  describe("Checkpoint TENDEROS-2.1-P2.2-F2 — Response Package V2 provenance", () => {
    it("captures the resolved ResponsePackageVersion/artifact/checksum on the recorded submission when resolvable", async () => {
      const submittable: SubmittableResponsePackageVersion = {
        responsePackageId: "rp-1",
        responsePackageVersionId: "rpv-1",
        versionNumber: 3,
        artifactId: "artifact-1",
        artifactChecksum: "c".repeat(64),
        artifactFileName: "TenderOS_tender-1_V3.zip",
      };
      const useCase = buildUseCase({
        resolver: resolverWith([completedPackage()]),
        repository: inMemoryRepository(),
        submittableResponsePackageVersionUseCase: fakeSubmittableResponsePackageVersionUseCase({ status: "RESOLVED", ...submittable }),
      });

      const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW });

      expect(result.responsePackageVersionId).toBe("rpv-1");
      expect(result.responsePackageArtifactId).toBe("artifact-1");
      expect(result.responsePackageArtifactChecksum).toBe("c".repeat(64));
    });

    it("mission §16/§29 — never blocks the legacy deposit when the V2 dossier is not resolvable without ambiguity (e.g. multi-lot Tender), leaves the new provenance fields empty", async () => {
      const useCase = buildUseCase({
        resolver: resolverWith([completedPackage()]),
        repository: inMemoryRepository(),
        submittableResponsePackageVersionUseCase: fakeSubmittableResponsePackageVersionUseCase({ status: "AMBIGUOUS_OR_ABSENT" }),
      });

      const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW });

      expect(result.status).toBe(TenderSubmissionStatus.Submitted);
      expect(result.responsePackageVersionId).toBeUndefined();
      expect(result.responsePackageArtifactId).toBeUndefined();
      expect(result.responsePackageArtifactChecksum).toBeUndefined();
    });

    it("mission §67 — refuses cleanly (no Submission persisted) when the V2 dossier resolves without ambiguity but has no generated artifact", async () => {
      const repository = inMemoryRepository();
      const useCase = buildUseCase({
        resolver: resolverWith([completedPackage()]),
        repository,
        submittableResponsePackageVersionUseCase: fakeSubmittableResponsePackageVersionUseCase({ status: "ARTIFACT_MISSING", responsePackageId: "rp-1", responsePackageVersionId: "rpv-1" }),
      });

      await expect(
        useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.Place, submittedAt: NOW }),
      ).rejects.toBeInstanceOf(ResponsePackageArtifactMissingError);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("Checkpoint TENDEROS-2.1-P2.2-F2.1 (ferme le gap identifié par l'audit F2) — also captures provenance when completing a SUBMISSION_IN_PROGRESS row (start -> recordFromInProgress)", async () => {
      const started = TenderSubmission.start({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), startedByUserId: "user-1", platform: SubmissionPlatform.Place, occurredAt: NOW });
      const repository = inMemoryRepository(started);
      const submittable: SubmittableResponsePackageVersion = {
        responsePackageId: "rp-1",
        responsePackageVersionId: "rpv-1",
        versionNumber: 1,
        artifactId: "artifact-1",
        artifactChecksum: "e".repeat(64),
        artifactFileName: "TenderOS_tender-1_V1.zip",
      };
      const useCase = buildUseCase({
        resolver: resolverWith([completedPackage()]),
        repository,
        submittableResponsePackageVersionUseCase: fakeSubmittableResponsePackageVersionUseCase({ status: "RESOLVED", ...submittable }),
      });

      const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.AwsAchat, submittedAt: NOW });

      expect(result.status).toBe(TenderSubmissionStatus.Submitted);
      expect(result.responsePackageVersionId).toBe("rpv-1");
      expect(result.responsePackageArtifactId).toBe("artifact-1");
      expect(result.responsePackageArtifactChecksum).toBe("e".repeat(64));
    });

    it("Checkpoint TENDEROS-2.1-P2.2-F2.1 — refuses cleanly when completing a SUBMISSION_IN_PROGRESS row whose V2 dossier resolves without ambiguity but has no generated artifact", async () => {
      const started = TenderSubmission.start({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, packageId: "pkg-1", packageVersion: 1, packageHash: "a".repeat(64), startedByUserId: "user-1", platform: SubmissionPlatform.Place, occurredAt: NOW });
      const repository = inMemoryRepository(started);
      const useCase = buildUseCase({
        resolver: resolverWith([completedPackage()]),
        repository,
        submittableResponsePackageVersionUseCase: fakeSubmittableResponsePackageVersionUseCase({ status: "ARTIFACT_MISSING", responsePackageId: "rp-1", responsePackageVersionId: "rpv-1" }),
      });

      await expect(
        useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, packageId: "pkg-1", platform: SubmissionPlatform.AwsAchat, submittedAt: NOW }),
      ).rejects.toBeInstanceOf(ResponsePackageArtifactMissingError);
      expect(repository.save).not.toHaveBeenCalled();
    });
  });
});
