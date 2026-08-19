import { beforeEach, describe, expect, it, vi } from "vitest";
import { PackageItemApplicabilityStatus, PackageItemCategory, PackageItemRequirementType, PackageItemSourceType, ResponsePackageStatus } from "../../domain/enums";
import { PackageItem } from "../../domain/package-item.entity";
import { ResponsePackageVersion } from "../../domain/response-package-version.entity";
import { ResponsePackage } from "../../domain/response-package.aggregate";
import { InMemoryPackageItemRepository, InMemoryResponsePackageVersionRepository } from "../../test-support/fakes";
import type { ResponsePackageAccessService } from "../services/response-package-access.service";
import { GetResponsePackageFreshnessUseCase } from "./get-response-package-freshness.use-case";

const OCCURRED_AT = new Date("2026-01-01T00:00:00.000Z");
const ORG = "org-1";

const EMPTY_LIST_RESULT = { execute: vi.fn(async () => []) };
const EMPTY_CANDIDATE_CONTEXT = { execute: vi.fn(async () => ({ isConsortiumBid: false, hasDeclaredSubcontractors: false })) };

function pkg(overrides: Partial<{ currentVersionId: string | undefined; currentVersionNumber: number }> = {}) {
  return ResponsePackage.rehydrate({
    id: "package-1",
    organizationId: ORG,
    tenderId: "tender-1",
    clientAccountId: "client-1",
    status: ResponsePackageStatus.Draft,
    currentVersionId: "version-1",
    currentVersionNumber: 1,
    createdBy: "user-1",
    createdAt: OCCURRED_AT,
    updatedAt: OCCURRED_AT,
    ...overrides,
  });
}

describe("GetResponsePackageFreshnessUseCase (Checkpoint 2.1-P2.1-FIX-E)", () => {
  let versionRepository: InMemoryResponsePackageVersionRepository;
  let itemRepository: InMemoryPackageItemRepository;
  let accessService: { loadPackage: ReturnType<typeof vi.fn> };
  let getTenderUseCase: { execute: ReturnType<typeof vi.fn> };
  let checklistItemRepository: { listByTender: ReturnType<typeof vi.fn> };

  function buildUseCase(currentPkg = pkg(), overrides: { adminDocs?: { execute: ReturnType<typeof vi.fn> } } = {}): GetResponsePackageFreshnessUseCase {
    accessService = { loadPackage: vi.fn(async () => currentPkg) };
    return new GetResponsePackageFreshnessUseCase(
      versionRepository,
      itemRepository,
      checklistItemRepository as never,
      accessService as unknown as ResponsePackageAccessService,
      getTenderUseCase as never,
      EMPTY_CANDIDATE_CONTEXT as never,
      (overrides.adminDocs ?? EMPTY_LIST_RESULT) as never,
      EMPTY_LIST_RESULT as never,
      EMPTY_LIST_RESULT as never,
    );
  }

  beforeEach(() => {
    versionRepository = new InMemoryResponsePackageVersionRepository();
    itemRepository = new InMemoryPackageItemRepository();
    getTenderUseCase = { execute: vi.fn(async () => ({ candidateCompanyId: "candidate-alpha" })) };
    checklistItemRepository = { listByTender: vi.fn(async () => []) };
  });

  it("UNKNOWN when the package has no version built yet", async () => {
    const result = await buildUseCase(pkg({ currentVersionId: undefined, currentVersionNumber: 0 })).execute({ organizationId: ORG, actorId: "user-1", actorRole: "OWNER", responsePackageId: "package-1" });
    expect(result.freshness).toBe("UNKNOWN");
  });

  it("CURRENT when candidate matches and no source has changed since the current version was built", async () => {
    versionRepository.versions.push(ResponsePackageVersion.create({ id: "version-1", organizationId: ORG, responsePackageId: "package-1", versionNumber: 1, createdBy: "user-1", occurredAt: OCCURRED_AT, candidateCompanyId: "candidate-alpha" }));

    const result = await buildUseCase().execute({ organizationId: ORG, actorId: "user-1", actorRole: "OWNER", responsePackageId: "package-1" });
    expect(result).toMatchObject({ freshness: "CURRENT", currentVersionId: "version-1", currentVersionNumber: 1 });
  });

  // BLOQUANT (mission §38) — le Candidate du tender a changé depuis la construction de la version
  // courante.
  it("BLOQUANT — STALE when the tender's candidate changed since the current version was built", async () => {
    versionRepository.versions.push(ResponsePackageVersion.create({ id: "version-1", organizationId: ORG, responsePackageId: "package-1", versionNumber: 1, createdBy: "user-1", occurredAt: OCCURRED_AT, candidateCompanyId: "candidate-alpha" }));
    getTenderUseCase.execute = vi.fn(async () => ({ candidateCompanyId: "candidate-beta" }));

    const result = await buildUseCase().execute({ organizationId: ORG, actorId: "user-1", actorRole: "OWNER", responsePackageId: "package-1" });
    expect(result.freshness).toBe("STALE");
  });

  // BLOQUANT (mission §40) — un document administratif validé a changé de version depuis la
  // construction du package.
  it("BLOQUANT — STALE when an administrative document's validated version changed since the package was built", async () => {
    versionRepository.versions.push(ResponsePackageVersion.create({ id: "version-1", organizationId: ORG, responsePackageId: "package-1", versionNumber: 1, createdBy: "user-1", occurredAt: OCCURRED_AT, candidateCompanyId: "candidate-alpha" }));
    itemRepository.items.push(
      PackageItem.create({
        id: "item-1",
        organizationId: ORG,
        responsePackageVersionId: "version-1",
        category: PackageItemCategory.Administrative,
        label: "Attestation fiscale",
        sourceType: PackageItemSourceType.AdministrativeDocument,
        sourceId: "admin-doc-1",
        documentId: "doc-1",
        documentVersionId: "doc-version-1",
        requirementType: PackageItemRequirementType.Required,
        applicabilityStatus: PackageItemApplicabilityStatus.Applicable,
        occurredAt: OCCURRED_AT,
      }),
    );

    const useCase = buildUseCase(pkg(), {
      adminDocs: { execute: vi.fn(async () => [{ administrativeDocumentId: "admin-doc-1", label: "Attestation fiscale", documentId: "doc-1", documentVersionId: "doc-version-2" }]) },
    });

    const result = await useCase.execute({ organizationId: ORG, actorId: "user-1", actorRole: "OWNER", responsePackageId: "package-1" });
    expect(result.freshness).toBe("STALE");
  });
});
