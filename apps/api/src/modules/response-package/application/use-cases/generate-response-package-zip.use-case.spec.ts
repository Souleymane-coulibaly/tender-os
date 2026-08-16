import { Readable } from "node:stream";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentVersion } from "../../../documents/domain/document-version.entity";
import { InMemoryDocumentVersionRepository, InMemoryStorageProvider } from "../../../documents/test-support/fakes";
import { JszipArchiveAdapter } from "../../infrastructure/zip/jszip-archive.adapter";
import { PackageItemApplicabilityStatus, PackageItemCategory, PackageItemRequirementType, PackageItemSourceType, ResponsePackageStatus } from "../../domain/enums";
import { PackageItem } from "../../domain/package-item.entity";
import { ResponsePackageVersion } from "../../domain/response-package-version.entity";
import { ResponsePackage } from "../../domain/response-package.aggregate";
import {
  FakeAtomicTransactionRunner,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryOutboxWriter,
  InMemoryPackageArtifactRepository,
  InMemoryPackageItemRepository,
  InMemoryResponsePackageRepository,
  InMemoryResponsePackageVersionRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import type { ResponsePackageAccessService } from "../services/response-package-access.service";
import { GenerateResponsePackageZipUseCase } from "./generate-response-package-zip.use-case";

const OCCURRED_AT = new Date("2026-01-01T00:00:00.000Z");
const ORG = "org-1";

/** Storage fake dont un flux source erreure APRÈS avoir émis quelques octets — reproduit une
 *  coupure réseau/storage en cours de lecture pendant l'assemblage du ZIP (P2, audit Codex). */
class FlakyStorageProvider extends InMemoryStorageProvider {
  constructor(private readonly brokenKey: string) {
    super();
  }
  override async openReadStream(key: string): Promise<Readable> {
    if (key === this.brokenKey) {
      let pushed = false;
      return new Readable({
        read() {
          if (pushed) return;
          pushed = true;
          this.push(Buffer.from("partial-bytes"));
          process.nextTick(() => this.destroy(new Error("simulated mid-stream storage failure")));
        },
      });
    }
    return super.openReadStream(key);
  }
}

describe("GenerateResponsePackageZipUseCase — P2 ZIP memory (audit Codex)", () => {
  let packageRepository: InMemoryResponsePackageRepository;
  let versionRepository: InMemoryResponsePackageVersionRepository;
  let itemRepository: InMemoryPackageItemRepository;
  let artifactRepository: InMemoryPackageArtifactRepository;
  let documentVersionRepository: InMemoryDocumentVersionRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let accessService: { loadPackage: ReturnType<typeof vi.fn> };
  let clock: FixedClock;
  let idGenerator: SequentialIdGenerator;
  // Recréé à chaque test (plutôt qu'un singleton partagé) : `markExported()` mute l'instance, et un
  // test qui vérifie explicitement l'ABSENCE d'export (échec mi-flux) ne doit jamais hériter d'un
  // état mutable laissé par un test précédent.
  let pkg: ResponsePackage;

  function buildUseCase(storageProvider: InMemoryStorageProvider): GenerateResponsePackageZipUseCase {
    return new GenerateResponsePackageZipUseCase(
      packageRepository,
      versionRepository,
      itemRepository,
      artifactRepository,
      documentVersionRepository,
      storageProvider,
      new JszipArchiveAdapter(),
      auditLogWriter,
      new FakeAtomicTransactionRunner(),
      new InMemoryOutboxWriter(),
      clock,
      idGenerator,
      accessService as unknown as ResponsePackageAccessService,
    );
  }

  function createVersion(): ResponsePackageVersion {
    const version = ResponsePackageVersion.create({ id: "version-1", organizationId: ORG, responsePackageId: "package-1", versionNumber: 1, createdBy: "user-1", occurredAt: OCCURRED_AT });
    version.validate({ validatedBy: "user-1", occurredAt: OCCURRED_AT });
    return version;
  }

  function createItem(overrides: Partial<Parameters<typeof PackageItem.create>[0]> & { id: string }): PackageItem {
    return PackageItem.create({
      responsePackageVersionId: "version-1",
      organizationId: ORG,
      category: PackageItemCategory.Administrative,
      label: overrides.id,
      sourceType: PackageItemSourceType.ChecklistItem,
      requirementType: PackageItemRequirementType.Required,
      applicabilityStatus: PackageItemApplicabilityStatus.Applicable,
      occurredAt: OCCURRED_AT,
      ...overrides,
    });
  }

  async function seedDocumentVersion(input: { versionId: string; documentId: string; filename: string; content: string; checksum: string }): Promise<void> {
    const version = DocumentVersion.create({
      id: input.versionId,
      organizationId: ORG,
      documentId: input.documentId,
      versionNumber: 1,
      originalFilename: input.filename,
      sanitizedFilename: input.filename,
      mimeType: "application/pdf",
      extension: "pdf",
      sizeBytes: input.content.length,
      checksum: input.checksum,
      storageKey: `${ORG}/${input.documentId}/${input.versionId}.pdf`,
      uploadedByUserId: "user-1",
      occurredAt: OCCURRED_AT,
    });
    await documentVersionRepository.seed(version);
  }

  // Filtré par préfixe : le dossier de staging est partagé avec d'autres fichiers de tests
  // exécutés en parallèle (workers séparés) — compter la totalité du dossier serait raciness,
  // isoler par préfixe (`stageStreamToTempFile(..., "response-package")`) rend l'assertion
  // déterministe.
  async function tempStagingDirEntries(): Promise<string[]> {
    const dir = join(tmpdir(), "tenderos-zip-staging");
    try {
      const entries = await readdir(dir);
      return entries.filter((name) => name.startsWith("response-package-"));
    } catch {
      return [];
    }
  }

  beforeEach(() => {
    clock = new FixedClock();
    idGenerator = new SequentialIdGenerator();
    packageRepository = new InMemoryResponsePackageRepository();
    versionRepository = new InMemoryResponsePackageVersionRepository();
    itemRepository = new InMemoryPackageItemRepository();
    artifactRepository = new InMemoryPackageArtifactRepository();
    documentVersionRepository = new InMemoryDocumentVersionRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    pkg = ResponsePackage.rehydrate({
      id: "package-1",
      organizationId: ORG,
      tenderId: "tender-1",
      clientAccountId: "client-1",
      status: ResponsePackageStatus.Validated,
      currentVersionId: "version-1",
      currentVersionNumber: 1,
      createdBy: "user-1",
      createdAt: OCCURRED_AT,
      updatedAt: OCCURRED_AT,
    });
    accessService = { loadPackage: vi.fn(async () => pkg) };
    packageRepository.packages.push(pkg);
    versionRepository.versions.push(createVersion());
  });

  it("produces a real streamed ZIP whose manifest fileHash reuses DocumentVersion.checksum (no re-hash)", async () => {
    itemRepository.items.push(createItem({ id: "item-1", documentId: "doc-1", documentVersionId: "docver-1" }));
    await seedDocumentVersion({ versionId: "docver-1", documentId: "doc-1", filename: "DC1.pdf", content: "contenu DC1", checksum: "checksum-from-upload" });
    const storageProvider = new InMemoryStorageProvider();
    await storageProvider.put({ key: `${ORG}/doc-1/docver-1.pdf`, content: Readable.from(Buffer.from("contenu DC1")), contentType: "application/pdf", sizeBytes: 11 });

    const useCase = buildUseCase(storageProvider);
    const { artifact } = await useCase.execute({ organizationId: ORG, actorId: "user-1", actorRole: "BID_MANAGER", responsePackageId: "package-1", responsePackageVersionId: "version-1" });

    expect(artifact.sizeBytes).toBeGreaterThan(0);
    expect(artifact.checksum).toMatch(/^[0-9a-f]{64}$/);
    const manifestItems = (artifact.manifest as { items: { fileHash: string; archivePath: string }[] }).items;
    expect(manifestItems[0]!.fileHash).toBe("checksum-from-upload");

    const stored = storageProvider.objects.get(artifact.storageKey)!;
    const reopened = await JSZip.loadAsync(stored.content);
    expect(await reopened.file("01_Administratif/DC1.pdf")!.async("string")).toBe("contenu DC1");
    expect(JSON.parse(await reopened.file("manifest.json")!.async("string")).items[0].fileHash).toBe("checksum-from-upload");
  });

  it("produces a valid ZIP containing only manifest.json when there are zero included items", async () => {
    const storageProvider = new InMemoryStorageProvider();
    const useCase = buildUseCase(storageProvider);

    const { artifact } = await useCase.execute({ organizationId: ORG, actorId: "user-1", actorRole: "BID_MANAGER", responsePackageId: "package-1", responsePackageVersionId: "version-1" });

    const stored = storageProvider.objects.get(artifact.storageKey)!;
    const reopened = await JSZip.loadAsync(stored.content);
    const fileEntries = Object.values(reopened.files).filter((entry) => !entry.dir).map((entry) => entry.name);
    expect(fileEntries).toEqual(["manifest.json"]);
  });

  it("suffixes a deterministic id when two items resolve to the same sanitized filename (§58)", async () => {
    itemRepository.items.push(createItem({ id: "item-1", documentId: "doc-1", documentVersionId: "docver-1" }), createItem({ id: "item-2", documentId: "doc-2", documentVersionId: "docver-2" }));
    await seedDocumentVersion({ versionId: "docver-1", documentId: "doc-1", filename: "DC1.pdf", content: "premier", checksum: "hash-1" });
    await seedDocumentVersion({ versionId: "docver-2", documentId: "doc-2", filename: "DC1.pdf", content: "second", checksum: "hash-2" });
    const storageProvider = new InMemoryStorageProvider();
    await storageProvider.put({ key: `${ORG}/doc-1/docver-1.pdf`, content: Readable.from(Buffer.from("premier")), contentType: "application/pdf", sizeBytes: 7 });
    await storageProvider.put({ key: `${ORG}/doc-2/docver-2.pdf`, content: Readable.from(Buffer.from("second")), contentType: "application/pdf", sizeBytes: 6 });

    const useCase = buildUseCase(storageProvider);
    const { artifact } = await useCase.execute({ organizationId: ORG, actorId: "user-1", actorRole: "BID_MANAGER", responsePackageId: "package-1", responsePackageVersionId: "version-1" });

    const stored = storageProvider.objects.get(artifact.storageKey)!;
    const reopened = await JSZip.loadAsync(stored.content);
    const fileEntries = Object.values(reopened.files).filter((entry) => !entry.dir).map((entry) => entry.name);
    expect(fileEntries.filter((name) => name.endsWith("DC1.pdf"))).toHaveLength(2);
  });

  it("BLOQUANT — a mid-stream storage failure creates no artifact, never marks exported, and cleans up its temp file", async () => {
    itemRepository.items.push(createItem({ id: "item-1", documentId: "doc-1", documentVersionId: "docver-1" }));
    await seedDocumentVersion({ versionId: "docver-1", documentId: "doc-1", filename: "DC1.pdf", content: "contenu DC1", checksum: "checksum-from-upload" });
    const brokenKey = `${ORG}/doc-1/docver-1.pdf`;
    const storageProvider = new FlakyStorageProvider(brokenKey);

    const before = await tempStagingDirEntries();
    const useCase = buildUseCase(storageProvider);
    await expect(useCase.execute({ organizationId: ORG, actorId: "user-1", actorRole: "BID_MANAGER", responsePackageId: "package-1", responsePackageVersionId: "version-1" })).rejects.toThrow();

    expect(artifactRepository.artifacts).toHaveLength(0);
    expect(pkg.status).not.toBe(ResponsePackageStatus.Exported);
    expect(auditLogWriter.entries.map((e) => e.action)).toContain("response_package.generation_failed");
    const after = await tempStagingDirEntries();
    expect(after.length).toBe(before.length);
  });
});
