import { Readable } from "node:stream";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { beforeEach, describe, expect, it } from "vitest";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { InMemoryStorageProvider } from "../../../documents/test-support/fakes";
import { PackageStatus } from "../../domain/package-status";
import { JszipArchiveAdapter } from "../../infrastructure/jszip-archive.adapter";
import type { SubmissionPackageRepository, SubmissionPackageWithFiles } from "../ports/submission-package.repository";
import { PackageAssemblyService, type PackageSourceFile } from "./package-assembly.service";

const ORG = "org-1";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

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

// Filtré par préfixe : le dossier de staging est partagé avec d'autres fichiers de tests exécutés
// en parallèle (worker séparés) — compter la totalité du dossier serait raciness, isoler par
// préfixe (`stageStreamToTempFile(..., "submission-package")`) rend l'assertion déterministe.
async function tempStagingDirEntries(): Promise<string[]> {
  const dir = join(tmpdir(), "tenderos-zip-staging");
  try {
    const entries = await readdir(dir);
    return entries.filter((name) => name.startsWith("submission-package-"));
  } catch {
    return [];
  }
}

function baseInput(overrides: Partial<Parameters<PackageAssemblyService["run"]>[0]> = {}) {
  return {
    organizationId: ORG,
    clientAccountId: "client-1",
    tenderId: "tender-1",
    validationRunId: "run-1",
    approvalId: "approval-1",
    readinessStatus: "READY",
    sources: [] as readonly PackageSourceFile[],
    createdBy: "user-1",
    occurredAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("PackageAssemblyService — P2 ZIP memory (audit Codex)", () => {
  let repository: InMemorySubmissionPackageRepository;
  let idGenerator: SequentialIdGenerator;

  beforeEach(() => {
    repository = new InMemorySubmissionPackageRepository();
    idGenerator = new SequentialIdGenerator();
  });

  function buildService(storageProvider: InMemoryStorageProvider): PackageAssemblyService {
    return new PackageAssemblyService(repository, new JszipArchiveAdapter(), storageProvider, idGenerator);
  }

  it("produces a real streamed ZIP that trusts the upstream fileHash (never recomputed)", async () => {
    const storageProvider = new InMemoryStorageProvider();
    await storageProvider.put({ key: "source-1", content: Readable.from(Buffer.from("contenu source")), contentType: "application/pdf", sizeBytes: 15 });
    const source: PackageSourceFile = {
      archivePath: "sources/DC1.pdf",
      sourceType: "EXPORT_ARTIFACT",
      sourceId: "export-1",
      fileName: "DC1.pdf",
      mimeType: "application/pdf",
      fileSize: 15,
      fileHash: HASH_A,
      sourceStorageKey: "source-1",
      order: 0,
    };

    const service = buildService(storageProvider);
    const { pkg } = await service.run(baseInput({ sources: [source] }));

    expect(pkg.status).toBe(PackageStatus.Completed);
    expect(pkg.fileHash).toMatch(/^[0-9a-f]{64}$/);
    expect(pkg.fileSize).toBeGreaterThan(0);

    const stored = storageProvider.objects.get(pkg.storageKey!)!;
    const reopened = await JSZip.loadAsync(stored.content);
    expect(await reopened.file("sources/DC1.pdf")!.async("string")).toBe("contenu source");
    const manifest = JSON.parse(await reopened.file("manifest.json")!.async("string"));
    expect(manifest.files.find((f: { archivePath: string }) => f.archivePath === "sources/DC1.pdf").fileHash).toBe(HASH_A);
  });

  it("produces a valid ZIP with just manifest.json when there are zero sources", async () => {
    const storageProvider = new InMemoryStorageProvider();
    const service = buildService(storageProvider);

    const { pkg } = await service.run(baseInput());

    expect(pkg.status).toBe(PackageStatus.Completed);
    const stored = storageProvider.objects.get(pkg.storageKey!)!;
    const reopened = await JSZip.loadAsync(stored.content);
    const fileEntries = Object.values(reopened.files).filter((entry) => !entry.dir).map((entry) => entry.name);
    expect(fileEntries).toEqual(["manifest.json"]);
  });

  it("assembles multiple sources without ever buffering more than one file at a time (functional proof via 2 sources)", async () => {
    const storageProvider = new InMemoryStorageProvider();
    await storageProvider.put({ key: "source-1", content: Readable.from(Buffer.from("premier")), contentType: "application/pdf", sizeBytes: 7 });
    await storageProvider.put({ key: "source-2", content: Readable.from(Buffer.from("second")), contentType: "application/pdf", sizeBytes: 6 });
    const sources: PackageSourceFile[] = [
      { archivePath: "sources/DC1.pdf", sourceType: "EXPORT_ARTIFACT", fileName: "DC1.pdf", mimeType: "application/pdf", fileSize: 7, fileHash: HASH_A, sourceStorageKey: "source-1", order: 0 },
      { archivePath: "sources/DC2.pdf", sourceType: "EXPORT_ARTIFACT", fileName: "DC2.pdf", mimeType: "application/pdf", fileSize: 6, fileHash: HASH_B, sourceStorageKey: "source-2", order: 1 },
    ];

    const service = buildService(storageProvider);
    const { pkg } = await service.run(baseInput({ sources }));

    const stored = storageProvider.objects.get(pkg.storageKey!)!;
    const reopened = await JSZip.loadAsync(stored.content);
    expect(await reopened.file("sources/DC1.pdf")!.async("string")).toBe("premier");
    expect(await reopened.file("sources/DC2.pdf")!.async("string")).toBe("second");
  });

  it("BLOQUANT — a mid-stream storage failure marks the package FAILED (never a false COMPLETED) and cleans up its temp file", async () => {
    const brokenKey = "source-1";
    const storageProvider = new FlakyStorageProvider(brokenKey);
    const source: PackageSourceFile = {
      archivePath: "sources/DC1.pdf",
      sourceType: "EXPORT_ARTIFACT",
      fileName: "DC1.pdf",
      mimeType: "application/pdf",
      fileSize: 15,
      fileHash: HASH_A,
      sourceStorageKey: brokenKey,
      order: 0,
    };

    const before = await tempStagingDirEntries();
    const service = buildService(storageProvider);
    await expect(service.run(baseInput({ sources: [source] }))).rejects.toThrow();

    // `create()` a déjà enregistré `pkg` (même référence) avant l'échec d'assemblage — la mutation
    // `markFailed()` faite par le service est donc observable ici, jamais un faux COMPLETED.
    expect(repository.rows[0]!.pkg.status).toBe(PackageStatus.Failed);
    const after = await tempStagingDirEntries();
    expect(after.length).toBe(before.length);
  });
});
