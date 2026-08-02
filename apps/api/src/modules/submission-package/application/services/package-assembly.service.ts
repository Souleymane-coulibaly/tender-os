import { Inject, Injectable } from "@nestjs/common";
import { Readable } from "node:stream";
import { STORAGE_PROVIDER, type StorageProvider } from "../../../documents";
import { computeSha256 } from "../../../../shared-kernel/file-hash";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { PackageFile, type PackageFileSourceType } from "../../domain/package-file";
import { SubmissionPackage } from "../../domain/submission-package.aggregate";
import type { SubmissionPackageManifest } from "../dtos";
import { SUBMISSION_PACKAGE_REPOSITORY, type SubmissionPackageRepository } from "../ports/submission-package.repository";
import { ZIP_ARCHIVE_PORT, type ZipArchivePort } from "../ports/zip-archive.port";

/** Une source à inclure dans le ZIP — `sourceStorageKey` est PRIVÉ à ce service (jamais persisté
 *  sur `PackageFile`, jamais exposé) : il sert uniquement à relire les octets réels au moment de
 *  l'assemblage. */
export type PackageSourceFile = Readonly<{
  archivePath: string;
  sourceType: PackageFileSourceType;
  sourceId?: string | undefined;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  sourceStorageKey: string;
  order: number;
}>;

export type RunPackageAssemblyInput = Readonly<{
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  validationRunId: string;
  approvalId: string;
  readinessStatus: string;
  sources: readonly PackageSourceFile[];
  createdBy: string;
  occurredAt: Date;
}>;

/**
 * Mission Sprint 8A bis §52/§69 — même discipline atomique que `ExportRenderPipelineService` :
 * transaction courte PENDING → assemblage ZIP réel HORS transaction (jamais un ZIP construit à
 * l'intérieur d'une transaction DB ouverte) → transaction courte succès/erreur. Le manifest
 * (mission §53) est un fichier DE PLUS dans le ZIP, généré ici à partir des SEULES métadonnées déjà
 * connues des autres fichiers — jamais recalculé après coup.
 */
@Injectable()
export class PackageAssemblyService {
  constructor(
    @Inject(SUBMISSION_PACKAGE_REPOSITORY) private readonly submissionPackageRepository: SubmissionPackageRepository,
    @Inject(ZIP_ARCHIVE_PORT) private readonly zipArchivePort: ZipArchivePort,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async run(input: RunPackageAssemblyInput): Promise<{ pkg: SubmissionPackage; files: readonly PackageFile[] }> {
    const version = await this.submissionPackageRepository.nextVersion({ organizationId: input.organizationId, tenderId: input.tenderId });
    const packageId = this.idGenerator.generate();

    const manifestPath = "manifest.json";
    const files = [
      ...input.sources.map((s) =>
        PackageFile.create({ archivePath: s.archivePath, sourceType: s.sourceType, sourceId: s.sourceId, fileName: s.fileName, mimeType: s.mimeType, fileSize: s.fileSize, fileHash: s.fileHash, order: s.order }),
      ),
    ];

    const manifest: SubmissionPackageManifest = {
      packageId,
      tenderId: input.tenderId,
      version,
      validationRunId: input.validationRunId,
      approvalId: input.approvalId,
      readinessStatus: input.readinessStatus,
      generatedAt: input.occurredAt.toISOString(),
      generatedBy: input.createdBy,
      files: files.map((f) => ({ archivePath: f.archivePath, sourceType: f.sourceType, sourceId: f.sourceId, fileName: f.fileName, fileHash: f.fileHash, fileSize: f.fileSize })),
    };
    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), "utf-8");
    const manifestFile = PackageFile.create({
      archivePath: manifestPath,
      sourceType: "MANIFEST",
      fileName: "manifest.json",
      mimeType: "application/json",
      fileSize: manifestBuffer.length,
      fileHash: computeSha256(manifestBuffer),
      order: files.length,
    });
    files.push(manifestFile);

    const pkg = SubmissionPackage.create({
      id: packageId,
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      tenderId: input.tenderId,
      version,
      validationRunId: input.validationRunId,
      approvalId: input.approvalId,
      readinessStatus: input.readinessStatus,
      files,
      createdBy: input.createdBy,
      occurredAt: input.occurredAt,
    });

    // Transaction courte n°1 : PENDING + fichiers.
    await this.submissionPackageRepository.create({ pkg, files });
    pkg.markGenerating();
    await this.submissionPackageRepository.markGenerating({ organizationId: input.organizationId, packageId });

    try {
      // Assemblage ZIP HORS transaction (mission §69) : relit les octets réels de chaque source.
      const entries: { archivePath: string; content: Buffer }[] = [];
      for (const source of input.sources) {
        const stream = await this.storageProvider.openReadStream(source.sourceStorageKey);
        const buffer = await streamToBuffer(stream);
        entries.push({ archivePath: source.archivePath, content: buffer });
      }
      entries.push({ archivePath: manifestPath, content: manifestBuffer });

      const zipBuffer = await this.zipArchivePort.build(entries);
      const zipHash = computeSha256(zipBuffer);
      const fileName = `package-${input.tenderId}-v${version}.zip`;
      const storageKey = `packages/${input.organizationId}/${input.tenderId}/${packageId}.zip`;

      await this.storageProvider.put({ key: storageKey, content: Readable.from(zipBuffer), contentType: "application/zip", sizeBytes: zipBuffer.length });

      await this.submissionPackageRepository.completeWithArchive({
        organizationId: input.organizationId,
        packageId,
        fileName,
        mimeType: "application/zip",
        fileSize: zipBuffer.length,
        fileHash: zipHash,
        storageKey,
        manifestJson: manifest,
        occurredAt: input.occurredAt,
      });
      pkg.markCompleted({ fileName, mimeType: "application/zip", fileSize: zipBuffer.length, fileHash: zipHash, storageKey, occurredAt: input.occurredAt });

      return { pkg, files };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "unknown packaging error";
      await this.submissionPackageRepository.markFailed({
        organizationId: input.organizationId,
        packageId,
        errorCode: "PACKAGE_ASSEMBLY_FAILED",
        errorMessage: errorMessage.slice(0, 500),
        occurredAt: input.occurredAt,
      });
      pkg.markFailed({ errorCode: "PACKAGE_ASSEMBLY_FAILED", errorMessage: errorMessage.slice(0, 500), occurredAt: input.occurredAt });
      throw error;
    }
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

