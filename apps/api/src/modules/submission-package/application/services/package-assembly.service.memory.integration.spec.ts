import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { LocalFilesystemStorageProvider } from "../../../documents/infrastructure/local-filesystem-storage.provider";
import { JszipArchiveAdapter } from "../../infrastructure/jszip-archive.adapter";
import type { SubmissionPackageRepository, SubmissionPackageWithFiles } from "../ports/submission-package.repository";
import { PackageAssemblyService, type PackageSourceFile } from "./package-assembly.service";

const ORG = "org-1";

class SequentialIdGenerator implements IdGenerator {
  private counter = 0;
  generate(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

class InMemorySubmissionPackageRepository implements SubmissionPackageRepository {
  readonly rows: SubmissionPackageWithFiles[] = [];
  private version = 0;
  async create(input: SubmissionPackageWithFiles): Promise<void> {
    this.rows.push(input);
  }
  async findById(input: { organizationId: string; packageId: string }): Promise<SubmissionPackageWithFiles | null> {
    return this.rows.find((r) => r.pkg.id === input.packageId && r.pkg.organizationId === input.organizationId) ?? null;
  }
  async listForTender(): Promise<readonly SubmissionPackageWithFiles[]> {
    return this.rows;
  }
  async findLatestCompletedForTender(): Promise<SubmissionPackageWithFiles | null> {
    return null;
  }
  async nextVersion(): Promise<number> {
    this.version += 1;
    return this.version;
  }
  async markGenerating(): Promise<void> {}
  async completeWithArchive(): Promise<void> {}
  async markFailed(): Promise<void> {}
}

function sha256OfRepeatedChunk(sizeBytes: number): string {
  const hash = createHash("sha256");
  const CHUNK = 64 * 1024;
  let remaining = sizeBytes;
  while (remaining > 0) {
    const size = Math.min(CHUNK, remaining);
    remaining -= size;
    hash.update(Buffer.alloc(size, "x"));
  }
  return hash.digest("hex");
}

async function seedSource(input: { storageProvider: LocalFilesystemStorageProvider; id: string; sizeBytes: number }): Promise<PackageSourceFile> {
  const storageKey = `sources/${input.id}.bin`;
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

  return {
    archivePath: `sources/${input.id}.bin`,
    sourceType: "EXPORT_ARTIFACT",
    fileName: `${input.id}.bin`,
    mimeType: "application/octet-stream",
    fileSize: input.sizeBytes,
    fileHash: sha256OfRepeatedChunk(input.sizeBytes),
    sourceStorageKey: storageKey,
    order: 0,
  };
}

/**
 * P2 (audit Codex, ZIP memory) — mesures MANUELLES, jamais dans `pnpm test` (suffixe
 * `.integration.spec.ts`) ni bloquantes dans `pnpm test:integration` (gardées par
 * `RUN_ZIP_MEMORY_TESTS=1`). Miroir de `generate-response-package-zip.memory.integration.spec.ts` —
 * `LocalFilesystemStorageProvider` réel (pas le fake en mémoire) pour mesurer le vrai chemin
 * streamé de bout en bout. Aucune assertion sur un chiffre de mémoire non mesuré.
 */
describe.skipIf(!process.env.RUN_ZIP_MEMORY_TESTS)("PackageAssemblyService — memory/volumetry (manual, P2 audit Codex)", () => {
  async function buildHarness() {
    const testRoot = join(process.cwd(), ".local-storage", `zip-memory-${randomUUID()}`);
    process.env.DOCUMENT_LOCAL_STORAGE_PATH = testRoot;
    const storageProvider = new LocalFilesystemStorageProvider();
    const repository = new InMemorySubmissionPackageRepository();
    const service = new PackageAssemblyService(repository, new JszipArchiveAdapter(), storageProvider, new SequentialIdGenerator());
    return { service, storageProvider, cleanup: () => rm(testRoot, { recursive: true, force: true }) };
  }

  function baseInput(sources: readonly PackageSourceFile[]) {
    return {
      organizationId: ORG,
      clientAccountId: "client-1",
      tenderId: "tender-1",
      validationRunId: "run-1",
      approvalId: "approval-1",
      readinessStatus: "READY",
      sources,
      createdBy: "user-1",
      occurredAt: new Date("2026-01-01T00:00:00.000Z"),
    };
  }

  it("scenario A — one ~50MB source: peak heap growth stays bounded, never proportional to file size", async () => {
    const harness = await buildHarness();
    try {
      const source = await seedSource({ storageProvider: harness.storageProvider, id: "big", sizeBytes: 50 * 1024 * 1024 });

      if (global.gc) global.gc();
      const before = process.memoryUsage();
      const { pkg } = await harness.service.run(baseInput([source]));
      if (global.gc) global.gc();
      const after = process.memoryUsage();

      expect(pkg.fileSize).toBeGreaterThan(0);
      // Mesure informative volontaire.
      console.log(`[ZIP memory][submission-package][50MB single file] heapUsed delta: ${((after.heapUsed - before.heapUsed) / 1024 / 1024).toFixed(1)} MB, rss delta: ${((after.rss - before.rss) / 1024 / 1024).toFixed(1)} MB`);
    } finally {
      await harness.cleanup();
    }
  }, 60_000);

  it("scenario B — ~100 small sources: succeeds and produces a complete, correctly-sized archive", async () => {
    const harness = await buildHarness();
    try {
      const sources: PackageSourceFile[] = [];
      for (let i = 0; i < 100; i += 1) {
        sources.push(await seedSource({ storageProvider: harness.storageProvider, id: `f${i}`, sizeBytes: 20 * 1024 }));
      }

      if (global.gc) global.gc();
      const before = process.memoryUsage();
      const { files } = await harness.service.run(baseInput(sources));
      if (global.gc) global.gc();
      const after = process.memoryUsage();

      expect(files).toHaveLength(101); // 100 sources + manifest.json
      // Mesure informative volontaire.
      console.log(`[ZIP memory][submission-package][100 small files] heapUsed delta: ${((after.heapUsed - before.heapUsed) / 1024 / 1024).toFixed(1)} MB, rss delta: ${((after.rss - before.rss) / 1024 / 1024).toFixed(1)} MB`);
    } finally {
      await harness.cleanup();
    }
  }, 60_000);
});
