import { Inject, Injectable } from "@nestjs/common";
import { Readable } from "node:stream";
import { STORAGE_PROVIDER, type StorageProvider } from "../../../documents";
import { computeSha256 } from "../../../../shared-kernel/file-hash";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { stageStreamToTempFile } from "../../../../shared-kernel/temp-file-staging";
import { PackageFile, type PackageFileSourceType } from "../../domain/package-file";
import { SubmissionPackage } from "../../domain/submission-package.aggregate";
import type { SubmissionPackageManifest } from "../dtos";
import { SUBMISSION_PACKAGE_REPOSITORY, type SubmissionPackageRepository, type SubmissionPackageResponsePackageProvenanceInput } from "../ports/submission-package.repository";
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
  /** Checkpoint TENDEROS-2.1-P2.2-F4.1 — provenance du `PackageArtifact` V2 dont ce package est le
   *  wrapper, figée telle quelle sur la ligne créée (jamais recalculée ici). */
  responsePackageVersionId?: string | undefined;
  responsePackageArtifactId?: string | undefined;
  responsePackageArtifactChecksum?: string | undefined;
  /** Checkpoint TENDEROS-2.1-P2.2-F4.1-CODEX-AUDIT — provenance MULTI-LOT (mode LOT uniquement,
   *  jamais en même temps que les 3 champs scalaires ci-dessus), figée telle quelle sur les lignes
   *  créées. */
  responsePackageProvenance?: readonly SubmissionPackageResponsePackageProvenanceInput[];
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

  async run(input: RunPackageAssemblyInput): Promise<{ pkg: SubmissionPackage; files: readonly PackageFile[]; responsePackageProvenance: readonly SubmissionPackageResponsePackageProvenanceInput[] }> {
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
      responsePackageVersionId: input.responsePackageVersionId,
      responsePackageArtifactId: input.responsePackageArtifactId,
      responsePackageArtifactChecksum: input.responsePackageArtifactChecksum,
      createdBy: input.createdBy,
      occurredAt: input.occurredAt,
    });

    // Transaction courte n°1 : PENDING + fichiers + provenance multi-lot (mode LOT uniquement).
    await this.submissionPackageRepository.create({ pkg, files, responsePackageProvenance: input.responsePackageProvenance ?? [] });
    pkg.markGenerating();
    await this.submissionPackageRepository.markGenerating({ organizationId: input.organizationId, packageId });

    try {
      // Assemblage ZIP HORS transaction (mission §69) : relit les octets réels de chaque source,
      // en flux (jamais bufferisée — P2 audit Codex, ZIP memory).
      const entries: { archivePath: string; content: Readable }[] = [];
      for (const source of input.sources) {
        const content = await this.storageProvider.openReadStream(source.sourceStorageKey);
        entries.push({ archivePath: source.archivePath, content });
      }
      entries.push({ archivePath: manifestPath, content: Readable.from(manifestBuffer) });

      const fileName = `package-${input.tenderId}-v${version}.zip`;
      const storageKey = `packages/${input.organizationId}/${input.tenderId}/${packageId}.zip`;

      // P2 (audit Codex, ZIP memory) — le ZIP est généré en flux et écrit vers un fichier
      // temporaire contrôlé, seul moyen de connaître `sizeBytes` (exigé par `StorageProvider.put()`)
      // et le checksum de l'archive sans les recalculer d'une seconde lecture dédiée. Nettoyage
      // garanti, y compris si `put()` échoue après le staging.
      const zipStream = this.zipArchivePort.buildStream(entries);
      const staged = await stageStreamToTempFile(zipStream, "submission-package");
      try {
        await this.storageProvider.put({ key: storageKey, content: staged.readStream(), contentType: "application/zip", sizeBytes: staged.sizeBytes });

        await this.submissionPackageRepository.completeWithArchive({
          organizationId: input.organizationId,
          packageId,
          fileName,
          mimeType: "application/zip",
          fileSize: staged.sizeBytes,
          fileHash: staged.sha256,
          storageKey,
          manifestJson: manifest,
          occurredAt: input.occurredAt,
        });
        pkg.markCompleted({ fileName, mimeType: "application/zip", fileSize: staged.sizeBytes, fileHash: staged.sha256, storageKey, occurredAt: input.occurredAt });

        return { pkg, files, responsePackageProvenance: input.responsePackageProvenance ?? [] };
      } finally {
        await staged.cleanup();
      }
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

