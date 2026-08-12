import { beforeEach, describe, expect, it, vi } from "vitest";
import { PackageItemApplicabilityStatus, PackageItemCategory, PackageItemRequirementType, PackageItemSourceType, ResponsePackageStatus, ResponsePackageVersionStatus } from "../../domain/enums";
import { ResponsePackageValidationBlockedError, ResponsePackageVersionValidatedError } from "../../domain/errors";
import { PackageItem } from "../../domain/package-item.entity";
import { ResponsePackageVersion } from "../../domain/response-package-version.entity";
import { ResponsePackage } from "../../domain/response-package.aggregate";
import {
  FakeAtomicTransactionRunner,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryOutboxWriter,
  InMemoryPackageItemRepository,
  InMemoryResponsePackageVersionRepository,
  InMemoryResponsePackageRepository,
  InMemoryTenderActivityWriter,
} from "../../test-support/fakes";
import type { ResponsePackageAccessService } from "../services/response-package-access.service";
import { ValidateResponsePackageVersionUseCase } from "./validate-response-package-version.use-case";

const OCCURRED_AT = new Date("2026-01-01T00:00:00.000Z");

describe("ValidateResponsePackageVersionUseCase — mission §42/§44/§97", () => {
  let packageRepository: InMemoryResponsePackageRepository;
  let versionRepository: InMemoryResponsePackageVersionRepository;
  let itemRepository: InMemoryPackageItemRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let accessService: { loadPackage: ReturnType<typeof vi.fn> };
  let clock: FixedClock;

  const pkg = ResponsePackage.rehydrate({
    id: "package-1",
    organizationId: "org-1",
    tenderId: "tender-1",
    clientAccountId: "client-1",
    status: ResponsePackageStatus.Draft,
    currentVersionId: "version-1",
    currentVersionNumber: 1,
    createdBy: "user-1",
    createdAt: OCCURRED_AT,
    updatedAt: OCCURRED_AT,
  });

  function buildUseCase(): ValidateResponsePackageVersionUseCase {
    return new ValidateResponsePackageVersionUseCase(
      packageRepository,
      versionRepository,
      itemRepository,
      auditLogWriter,
      new InMemoryTenderActivityWriter(),
      new FakeAtomicTransactionRunner(),
      new InMemoryOutboxWriter(),
      clock,
      accessService as unknown as ResponsePackageAccessService,
    );
  }

  function createVersion(): ResponsePackageVersion {
    return ResponsePackageVersion.create({ id: "version-1", organizationId: "org-1", responsePackageId: "package-1", versionNumber: 1, createdBy: "user-1", occurredAt: OCCURRED_AT });
  }

  function createItem(overrides: Partial<Parameters<typeof PackageItem.create>[0]> & { id: string }): PackageItem {
    return PackageItem.create({
      responsePackageVersionId: "version-1",
      organizationId: "org-1",
      category: PackageItemCategory.Administrative,
      label: overrides.id,
      sourceType: PackageItemSourceType.ChecklistItem,
      requirementType: PackageItemRequirementType.Required,
      applicabilityStatus: PackageItemApplicabilityStatus.Applicable,
      occurredAt: OCCURRED_AT,
      ...overrides,
    });
  }

  beforeEach(() => {
    clock = new FixedClock();
    packageRepository = new InMemoryResponsePackageRepository();
    versionRepository = new InMemoryResponsePackageVersionRepository();
    itemRepository = new InMemoryPackageItemRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    accessService = { loadPackage: vi.fn(async () => pkg) };
    packageRepository.packages.push(pkg);
    versionRepository.versions.push(createVersion());
  });

  it("BLOQUANT — refuses validation when a REQUIRED+APPLICABLE piece is missing, no override exists (§44/§97)", async () => {
    itemRepository.items.push(createItem({ id: "item-1", documentVersionId: undefined }));
    const useCase = buildUseCase();

    await expect(useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", responsePackageId: "package-1", responsePackageVersionId: "version-1" })).rejects.toThrow(
      ResponsePackageValidationBlockedError,
    );
    expect(versionRepository.versions[0]!.status).toBe(ResponsePackageVersionStatus.Draft);
  });

  it("BLOQUANT — OPTIONAL missing never blocks validation (§43/§98)", async () => {
    itemRepository.items.push(
      createItem({ id: "req-1", documentId: "doc-1", documentVersionId: "docver-1" }),
      createItem({ id: "opt-1", requirementType: PackageItemRequirementType.Optional, documentVersionId: undefined }),
    );
    const useCase = buildUseCase();
    const version = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", responsePackageId: "package-1", responsePackageVersionId: "version-1" });
    expect(version.status).toBe(ResponsePackageVersionStatus.Validated);
  });

  it("BLOQUANT — NOT_APPLICABLE never blocks validation (§45/§99/§100)", async () => {
    itemRepository.items.push(createItem({ id: "na-1", applicabilityStatus: PackageItemApplicabilityStatus.NotApplicable, documentVersionId: undefined }));
    const useCase = buildUseCase();
    const version = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", responsePackageId: "package-1", responsePackageVersionId: "version-1" });
    expect(version.status).toBe(ResponsePackageVersionStatus.Validated);
    expect(packageRepository.packages[0]!.status).toBe(ResponsePackageStatus.Validated);
  });

  it("BLOQUANT — NEEDS_REVIEW never auto-blocks validation (§47/§102)", async () => {
    itemRepository.items.push(createItem({ id: "review-1", applicabilityStatus: PackageItemApplicabilityStatus.NeedsReview, documentVersionId: undefined }));
    const useCase = buildUseCase();
    const version = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", responsePackageId: "package-1", responsePackageVersionId: "version-1" });
    expect(version.status).toBe(ResponsePackageVersionStatus.Validated);
  });

  it("BLOQUANT — a CONDITIONAL item resolved applicable + missing DOES block (mirrors DC4 §101)", async () => {
    itemRepository.items.push(createItem({ id: "dc4", requirementType: PackageItemRequirementType.Conditional, documentVersionId: undefined }));
    const useCase = buildUseCase();
    await expect(useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", responsePackageId: "package-1", responsePackageVersionId: "version-1" })).rejects.toThrow(
      ResponsePackageValidationBlockedError,
    );
  });

  it("records an AuditLog entry on successful validation", async () => {
    itemRepository.items.push(createItem({ id: "req-1", documentId: "doc-1", documentVersionId: "docver-1" }));
    const useCase = buildUseCase();
    await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", responsePackageId: "package-1", responsePackageVersionId: "version-1" });
    expect(auditLogWriter.entries.map((e) => e.action)).toEqual(["response_package.validated"]);
  });

  it("BLOQUANT — an already-VALIDATED version refuses a second validation", async () => {
    itemRepository.items.push(createItem({ id: "req-1", documentId: "doc-1", documentVersionId: "docver-1" }));
    versionRepository.versions[0]!.validate({ validatedBy: "user-1", occurredAt: OCCURRED_AT });

    const useCase = buildUseCase();
    await expect(useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "BID_MANAGER", responsePackageId: "package-1", responsePackageVersionId: "version-1" })).rejects.toThrow(
      ResponsePackageVersionValidatedError,
    );
  });
});
