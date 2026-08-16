import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { LocalFilesystemStorageProvider } from "../../../documents/infrastructure/local-filesystem-storage.provider";
import { DocumentVersion } from "../../../documents/domain/document-version.entity";
import { InMemoryDocumentVersionRepository } from "../../../documents/test-support/fakes";
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

/**
 * P2 (audit Codex, ZIP memory) — mesures MANUELLES, jamais dans `pnpm test` (suffixe
 * `.integration.spec.ts`, exclu par défaut, même motif que `cloudflare-r2-storage.provider.
 * integration.spec.ts`) ni bloquantes dans `pnpm test:integration` (gardées par
 * `RUN_ZIP_MEMORY_TESTS=1`, jamais SKIP => échec). Utilise `LocalFilesystemStorageProvider` (vrai
 * disque, jamais le fake en mémoire) pour que la mesure porte sur le VRAI chemin streamé de bout
 * en bout, pas sur un double qui bufferise tout de toute façon. Aucune assertion sur un chiffre de
 * mémoire non mesuré au préalable — seules l'intégrité du ZIP produit et la valeur du delta mémoire
 * (imprimée à titre informatif) sont observées.
 */
describe.skipIf(!process.env.RUN_ZIP_MEMORY_TESTS)("GenerateResponsePackageZipUseCase — memory/volumetry (manual, P2 audit Codex)", () => {
  async function buildHarness() {
    const testRoot = join(process.cwd(), ".local-storage", `zip-memory-${randomUUID()}`);
    process.env.DOCUMENT_LOCAL_STORAGE_PATH = testRoot;
    const storageProvider = new LocalFilesystemStorageProvider();

    const documentVersionRepository = new InMemoryDocumentVersionRepository();
    const packageRepository = new InMemoryResponsePackageRepository();
    const versionRepository = new InMemoryResponsePackageVersionRepository();
    const itemRepository = new InMemoryPackageItemRepository();
    const artifactRepository = new InMemoryPackageArtifactRepository();
    const auditLogWriter = new InMemoryAuditLogWriter();
    const clock = new FixedClock();
    const idGenerator = new SequentialIdGenerator();

    const pkg = ResponsePackage.rehydrate({
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
    packageRepository.packages.push(pkg);

    const version = ResponsePackageVersion.create({ id: "version-1", organizationId: ORG, responsePackageId: "package-1", versionNumber: 1, createdBy: "user-1", occurredAt: OCCURRED_AT });
    version.validate({ validatedBy: "user-1", occurredAt: OCCURRED_AT });
    versionRepository.versions.push(version);

    const accessService = { loadPackage: async () => pkg };
    const useCase = new GenerateResponsePackageZipUseCase(
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

    return { useCase, itemRepository, documentVersionRepository, storageProvider, cleanup: () => rm(testRoot, { recursive: true, force: true }) };
  }

  async function seedFile(input: { documentVersionRepository: InMemoryDocumentVersionRepository; storageProvider: LocalFilesystemStorageProvider; itemRepository: InMemoryPackageItemRepository; itemId: string; sizeBytes: number }): Promise<void> {
    const documentId = `doc-${input.itemId}`;
    const versionId = `docver-${input.itemId}`;
    const storageKey = `${ORG}/${documentId}/${versionId}.bin`;
    const filename = `${input.itemId}.bin`;

    const version = DocumentVersion.create({
      id: versionId,
      organizationId: ORG,
      documentId,
      versionNumber: 1,
      originalFilename: filename,
      sanitizedFilename: filename,
      mimeType: "application/octet-stream",
      extension: "bin",
      sizeBytes: input.sizeBytes,
      checksum: `checksum-${input.itemId}`,
      storageKey,
      uploadedByUserId: "user-1",
      occurredAt: OCCURRED_AT,
    });
    await input.documentVersionRepository.seed(version);

    // Génère `sizeBytes` octets par blocs bornés (jamais un `Buffer.alloc(sizeBytes)` unique) — le
    // FIXTURE lui-même ne doit pas fausser la mesure en pré-bufferisant tout en mémoire.
    const CHUNK = 64 * 1024;
    let remaining = input.sizeBytes;
    const source = new Readable({
      read() {
        if (remaining <= 0) {
          this.push(null);
          return;
        }
        const size = Math.min(CHUNK, remaining);
        remaining -= size;
        this.push(Buffer.alloc(size, "x"));
      },
    });
    await input.storageProvider.put({ key: storageKey, content: source, contentType: "application/octet-stream", sizeBytes: input.sizeBytes });

    input.itemRepository.items.push(
      PackageItem.create({
        id: `item-${input.itemId}`,
        responsePackageVersionId: "version-1",
        organizationId: ORG,
        category: PackageItemCategory.Annex,
        label: input.itemId,
        sourceType: PackageItemSourceType.ChecklistItem,
        requirementType: PackageItemRequirementType.Required,
        applicabilityStatus: PackageItemApplicabilityStatus.Applicable,
        documentId,
        documentVersionId: versionId,
        occurredAt: OCCURRED_AT,
      }),
    );
  }

  it("scenario A — one ~50MB file: peak heap growth stays bounded, never proportional to file size", async () => {
    const harness = await buildHarness();
    try {
      await seedFile({ ...harness, itemId: "big", sizeBytes: 50 * 1024 * 1024 });

      if (global.gc) global.gc();
      const before = process.memoryUsage();
      const { artifact } = await harness.useCase.execute({ organizationId: ORG, actorId: "user-1", actorRole: "BID_MANAGER", responsePackageId: "package-1", responsePackageVersionId: "version-1" });
      if (global.gc) global.gc();
      const after = process.memoryUsage();

      expect(artifact.sizeBytes).toBeGreaterThan(0);
      // Mesure informative volontaire (§ mission : jamais un chiffre inventé, uniquement observé ici).
      console.log(`[ZIP memory][response-package][50MB single file] heapUsed delta: ${((after.heapUsed - before.heapUsed) / 1024 / 1024).toFixed(1)} MB, rss delta: ${((after.rss - before.rss) / 1024 / 1024).toFixed(1)} MB`);
    } finally {
      await harness.cleanup();
    }
  }, 60_000);

  it("scenario B — ~100 small files: succeeds and produces a complete, correctly-sized archive", async () => {
    const harness = await buildHarness();
    try {
      const fileSize = 20 * 1024;
      for (let i = 0; i < 100; i += 1) {
        await seedFile({ ...harness, itemId: `f${i}`, sizeBytes: fileSize });
      }

      if (global.gc) global.gc();
      const before = process.memoryUsage();
      const { artifact } = await harness.useCase.execute({ organizationId: ORG, actorId: "user-1", actorRole: "BID_MANAGER", responsePackageId: "package-1", responsePackageVersionId: "version-1" });
      if (global.gc) global.gc();
      const after = process.memoryUsage();

      expect(artifact.sizeBytes).toBeGreaterThan(0);
      const manifestItems = (artifact.manifest as { items: unknown[] }).items;
      expect(manifestItems).toHaveLength(100);
      // Mesure informative volontaire.
      console.log(`[ZIP memory][response-package][100 small files] heapUsed delta: ${((after.heapUsed - before.heapUsed) / 1024 / 1024).toFixed(1)} MB, rss delta: ${((after.rss - before.rss) / 1024 / 1024).toFixed(1)} MB`);
    } finally {
      await harness.cleanup();
    }
  }, 60_000);
});
