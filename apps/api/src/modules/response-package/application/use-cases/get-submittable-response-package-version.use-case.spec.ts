import { describe, expect, it, vi } from "vitest";
import { GetSubmittableResponsePackageVersionUseCase } from "./get-submittable-response-package-version.use-case";
import type { GetRequiredResponsePackagesForTenderUseCase } from "./get-required-response-packages-for-tender.use-case";
import type { ResponsePackageRequirement } from "../../domain/services/resolve-response-package-requirements";
import type { ResponsePackageVersionRepository } from "../ports/response-package-version.repository";
import type { PackageArtifactRepository } from "../ports/package-artifact.repository";

const ORGANIZATION_ID = "org-1";
const QUERY = { organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: "tender-1" };

function fakeRequirements(requirements: readonly ResponsePackageRequirement[]): GetRequiredResponsePackagesForTenderUseCase {
  return { execute: vi.fn(async () => requirements) } as unknown as GetRequiredResponsePackagesForTenderUseCase;
}
function fakeVersionRepository(versions: Record<string, { id: string; versionNumber: number; isValidated: boolean } | undefined>): ResponsePackageVersionRepository {
  return { findById: vi.fn(async ({ responsePackageVersionId }: { responsePackageVersionId: string }) => versions[responsePackageVersionId] ?? null) } as unknown as ResponsePackageVersionRepository;
}
function fakeArtifactRepository(
  artifactsByVersion: Record<string, { id: string; checksum: string; fileName: string; storageKey?: string; mimeType?: string; sizeBytes?: number }[]>,
): PackageArtifactRepository {
  return {
    listByVersion: vi.fn(async ({ responsePackageVersionId }: { responsePackageVersionId: string }) =>
      (artifactsByVersion[responsePackageVersionId] ?? []).map((a) => ({ storageKey: `storage/${a.id}`, mimeType: "application/zip", sizeBytes: 1024, ...a })),
    ),
  } as unknown as PackageArtifactRepository;
}

describe("GetSubmittableResponsePackageVersionUseCase — LOT mode", () => {
  it("mission §12/§13 — RESOLVED_MULTI_LOT when every required lot resolves without ambiguity", async () => {
    const requirements: ResponsePackageRequirement[] = [
      { lotId: "lot-a", matchingPackages: [{ id: "pkg-a", lotId: "lot-a", currentVersionId: "v-a", status: "VALIDATED" }] },
      { lotId: "lot-b", matchingPackages: [{ id: "pkg-b", lotId: "lot-b", currentVersionId: "v-b", status: "VALIDATED" }] },
    ];
    const useCase = new GetSubmittableResponsePackageVersionUseCase(
      fakeRequirements(requirements),
      fakeVersionRepository({ "v-a": { id: "v-a", versionNumber: 1, isValidated: true }, "v-b": { id: "v-b", versionNumber: 1, isValidated: true } }),
      fakeArtifactRepository({ "v-a": [{ id: "art-a", checksum: "a".repeat(64), fileName: "A.zip" }], "v-b": [{ id: "art-b", checksum: "b".repeat(64), fileName: "B.zip" }] }),
    );

    const result = await useCase.execute(QUERY);

    expect(result.status).toBe("RESOLVED_MULTI_LOT");
    if (result.status !== "RESOLVED_MULTI_LOT") throw new Error("unreachable");
    expect(result.entries).toEqual([
      {
        lotId: "lot-a",
        responsePackageId: "pkg-a",
        responsePackageVersionId: "v-a",
        versionNumber: 1,
        artifactId: "art-a",
        artifactChecksum: "a".repeat(64),
        artifactFileName: "A.zip",
        artifactStorageKey: "storage/art-a",
        artifactMimeType: "application/zip",
        artifactSizeBytes: 1024,
      },
      {
        lotId: "lot-b",
        responsePackageId: "pkg-b",
        responsePackageVersionId: "v-b",
        versionNumber: 1,
        artifactId: "art-b",
        artifactChecksum: "b".repeat(64),
        artifactFileName: "B.zip",
        artifactStorageKey: "storage/art-b",
        artifactMimeType: "application/zip",
        artifactSizeBytes: 1024,
      },
    ]);
  });

  it("mission §13/§14 — LOT_RESPONSE_PACKAGE_MISSING when a required lot has zero matching packages", async () => {
    const requirements: ResponsePackageRequirement[] = [
      { lotId: "lot-a", matchingPackages: [{ id: "pkg-a", lotId: "lot-a", currentVersionId: "v-a", status: "VALIDATED" }] },
      { lotId: "lot-b", matchingPackages: [] },
    ];
    const useCase = new GetSubmittableResponsePackageVersionUseCase(
      fakeRequirements(requirements),
      fakeVersionRepository({ "v-a": { id: "v-a", versionNumber: 1, isValidated: true } }),
      fakeArtifactRepository({ "v-a": [{ id: "art-a", checksum: "a".repeat(64), fileName: "A.zip" }] }),
    );

    const result = await useCase.execute(QUERY);

    expect(result).toEqual({ status: "LOT_RESPONSE_PACKAGE_MISSING", missingLotIds: ["lot-b"] });
  });

  it("mission §30 — ARTIFACT_MISSING (with lotId) when a required lot's package is CURRENT/validated but has no generated artifact", async () => {
    const requirements: ResponsePackageRequirement[] = [
      { lotId: "lot-a", matchingPackages: [{ id: "pkg-a", lotId: "lot-a", currentVersionId: "v-a", status: "VALIDATED" }] },
      { lotId: "lot-b", matchingPackages: [{ id: "pkg-b", lotId: "lot-b", currentVersionId: "v-b", status: "VALIDATED" }] },
    ];
    const useCase = new GetSubmittableResponsePackageVersionUseCase(
      fakeRequirements(requirements),
      fakeVersionRepository({ "v-a": { id: "v-a", versionNumber: 1, isValidated: true }, "v-b": { id: "v-b", versionNumber: 1, isValidated: true } }),
      fakeArtifactRepository({ "v-a": [{ id: "art-a", checksum: "a".repeat(64), fileName: "A.zip" }], "v-b": [] }),
    );

    const result = await useCase.execute(QUERY);

    expect(result).toEqual({ status: "ARTIFACT_MISSING", responsePackageId: "pkg-b", responsePackageVersionId: "v-b", lotId: "lot-b" });
  });

  it("mission §5/§18 — GLOBAL mode (single requirement, lotId undefined) keeps the exact F2 RESOLVED shape", async () => {
    const requirements: ResponsePackageRequirement[] = [{ lotId: undefined, matchingPackages: [{ id: "pkg-global", lotId: undefined, currentVersionId: "v-global", status: "VALIDATED" }] }];
    const useCase = new GetSubmittableResponsePackageVersionUseCase(
      fakeRequirements(requirements),
      fakeVersionRepository({ "v-global": { id: "v-global", versionNumber: 3, isValidated: true } }),
      fakeArtifactRepository({ "v-global": [{ id: "art-global", checksum: "c".repeat(64), fileName: "GLOBAL.zip" }] }),
    );

    const result = await useCase.execute(QUERY);

    expect(result).toEqual({
      status: "RESOLVED",
      responsePackageId: "pkg-global",
      responsePackageVersionId: "v-global",
      versionNumber: 3,
      artifactId: "art-global",
      artifactChecksum: "c".repeat(64),
      artifactFileName: "GLOBAL.zip",
      artifactStorageKey: "storage/art-global",
      artifactMimeType: "application/zip",
      artifactSizeBytes: 1024,
    });
  });

  it("mission §5 — GLOBAL mode with zero or multiple global packages stays AMBIGUOUS_OR_ABSENT, never blocking", async () => {
    const requirements: ResponsePackageRequirement[] = [{ lotId: undefined, matchingPackages: [] }];
    const useCase = new GetSubmittableResponsePackageVersionUseCase(fakeRequirements(requirements), fakeVersionRepository({}), fakeArtifactRepository({}));

    const result = await useCase.execute(QUERY);

    expect(result).toEqual({ status: "AMBIGUOUS_OR_ABSENT" });
  });
});
