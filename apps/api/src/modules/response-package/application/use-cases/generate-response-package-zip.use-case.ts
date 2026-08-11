import { Readable } from "node:stream";
import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { computeSha256 } from "../../../../shared-kernel/file-hash";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { readStreamToBuffer } from "../../../../shared-kernel/read-stream-to-buffer";
import { ClientPermission } from "../../../client-portfolio";
import { DOCUMENT_VERSION_REPOSITORY, STORAGE_PROVIDER, type DocumentVersionRepository, type StorageProvider } from "../../../documents";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { buildSafeArchivePath } from "../../domain/archive-path-safety";
import { PackageItemCategory } from "../../domain/enums";
import { PackageArtifactNotReadyError, ResponsePackageVersionNotFoundError } from "../../domain/errors";
import { PackageArtifact } from "../../domain/package-artifact.value-object";
import { assertResponsePackageAccess } from "../policies/response-package-access.policy";
import { ResponsePackageAccessService } from "../services/response-package-access.service";
import type { ZipEntry } from "../ports/zip-archive.port";
import { ZIP_ARCHIVE_PORT, type ZipArchivePort } from "../ports/zip-archive.port";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { PACKAGE_ARTIFACT_REPOSITORY, type PackageArtifactRepository } from "../ports/package-artifact.repository";
import { PACKAGE_ITEM_REPOSITORY, type PackageItemRepository } from "../ports/package-item.repository";
import { RESPONSE_PACKAGE_REPOSITORY, type ResponsePackageRepository } from "../ports/response-package.repository";
import { RESPONSE_PACKAGE_VERSION_REPOSITORY, type ResponsePackageVersionRepository } from "../ports/response-package-version.repository";

export type GenerateResponsePackageZipCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  responsePackageId: string;
  responsePackageVersionId: string;
  requestId?: string | undefined;
}>;

export type GenerateResponsePackageZipResult = Readonly<{ artifact: PackageArtifact }>;

const FOLDER_BY_CATEGORY: Record<PackageItemCategory, string> = {
  [PackageItemCategory.Administrative]: "01_Administratif",
  [PackageItemCategory.Legal]: "01_Administratif",
  [PackageItemCategory.Certificate]: "01_Administratif",
  [PackageItemCategory.Technical]: "02_Technique",
  [PackageItemCategory.Financial]: "03_Financier",
  [PackageItemCategory.Annex]: "04_Annexes",
  [PackageItemCategory.Other]: "04_Annexes",
};

/**
 * Point CENTRAL "Package final → ZIP" (mission §54-64) — action EXPLICITE et SÉPARÉE de la
 * validation (mission §55 "VALIDATED ≠ ZIP immédiatement généré"). Mission §56/§59/§60/§115-117 :
 * chemins d'archive TOUJOURS construits via `buildSafeArchivePath` (protection zip-slip), jamais un
 * nom de fichier brut fourni par une source externe. Même discipline transactionnelle que
 * `PackageAssemblyService` (`submission-package`, Sprint 8A bis) : assemblage ZIP HORS transaction
 * DB, jamais un faux statut EXPORTED si le stockage échoue (mission §92).
 */
@Injectable()
export class GenerateResponsePackageZipUseCase {
  constructor(
    @Inject(RESPONSE_PACKAGE_REPOSITORY) private readonly packageRepository: ResponsePackageRepository,
    @Inject(RESPONSE_PACKAGE_VERSION_REPOSITORY) private readonly versionRepository: ResponsePackageVersionRepository,
    @Inject(PACKAGE_ITEM_REPOSITORY) private readonly itemRepository: PackageItemRepository,
    @Inject(PACKAGE_ARTIFACT_REPOSITORY) private readonly artifactRepository: PackageArtifactRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly documentVersionRepository: DocumentVersionRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    @Inject(ZIP_ARCHIVE_PORT) private readonly zipArchivePort: ZipArchivePort,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly accessService: ResponsePackageAccessService,
  ) {}

  async execute(command: GenerateResponsePackageZipCommand): Promise<GenerateResponsePackageZipResult> {
    const pkg = await assertResponsePackageAccess(this.accessService, {
      organizationId: command.organizationId,
      responsePackageId: command.responsePackageId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.GenerateResponsePackage,
      requireUseOrgPermission: true,
    });

    const version = await this.versionRepository.findById({ organizationId: command.organizationId, responsePackageVersionId: command.responsePackageVersionId });
    if (!version || version.responsePackageId !== pkg.id) {
      throw new ResponsePackageVersionNotFoundError();
    }
    if (!version.isValidated) {
      throw new PackageArtifactNotReadyError();
    }

    try {
      const items = await this.itemRepository.listByVersion({ organizationId: command.organizationId, responsePackageVersionId: version.id });
      const includedItems = items.filter((item) => item.documentVersionId !== undefined);

      const usedPaths = new Set<string>();
      const manifestItems: Record<string, unknown>[] = [];
      const entries: ZipEntry[] = [];

      for (const item of includedItems) {
        const documentVersion = await this.documentVersionRepository.findById({ organizationId: command.organizationId, documentId: item.documentId!, versionId: item.documentVersionId! });
        if (!documentVersion) continue;

        const folder = FOLDER_BY_CATEGORY[item.category];
        let archivePath = buildSafeArchivePath([folder, documentVersion.sanitizedFilename]);
        if (usedPaths.has(archivePath)) {
          // Mission §58 — jamais un écrasement silencieux : un suffixe déterministe (id court)
          // distingue deux pièces qui partageraient le même nom de fichier assaini.
          archivePath = buildSafeArchivePath([folder, `${item.id.slice(0, 8)}_${documentVersion.sanitizedFilename}`]);
        }
        usedPaths.add(archivePath);

        const buffer = await readStreamToBuffer(await this.storageProvider.openReadStream(documentVersion.storageKey));
        entries.push({ archivePath, content: buffer });
        manifestItems.push({ packageItemId: item.id, label: item.label, category: item.category, archivePath, documentId: item.documentId, documentVersionId: item.documentVersionId, fileHash: computeSha256(buffer) });
      }

      const occurredAt = this.clock.now();
      const manifest = {
        responsePackageId: pkg.id,
        responsePackageVersionId: version.id,
        tenderId: pkg.tenderId,
        lotId: pkg.lotId ?? null,
        clientAccountId: pkg.clientAccountId,
        versionNumber: version.versionNumber,
        validatedBy: version.validatedBy,
        validatedAt: version.validatedAt?.toISOString(),
        generatedAt: occurredAt.toISOString(),
        generatedBy: command.actorId,
        items: manifestItems,
      };
      const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), "utf-8");
      entries.push({ archivePath: "manifest.json", content: manifestBuffer });

      const zipBuffer = await this.zipArchivePort.build(entries);
      const checksum = computeSha256(zipBuffer);
      const fileName = `TenderOS_${pkg.tenderId}${pkg.lotId ? `_Lot${pkg.lotId.slice(0, 8)}` : ""}_V${version.versionNumber}.zip`;
      const storageKey = `response-packages/${command.organizationId}/${pkg.tenderId}/${pkg.id}/${version.id}-${this.idGenerator.generate()}.zip`;

      await this.storageProvider.put({ key: storageKey, content: Readable.from(zipBuffer), contentType: "application/zip", sizeBytes: zipBuffer.length });

      const artifact = PackageArtifact.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        responsePackageVersionId: version.id,
        storageKey,
        fileName,
        mimeType: "application/zip",
        sizeBytes: zipBuffer.length,
        checksum,
        manifest,
        generatedBy: command.actorId,
        occurredAt,
      });

      pkg.markExported(occurredAt);

      await this.atomicTransactionRunner.run(async () => {
        await this.artifactRepository.create(artifact);
        await this.packageRepository.save(pkg);
        await this.auditLogWriter.record({
          organizationId: command.organizationId,
          actorType: "USER",
          actorId: command.actorId,
          action: "response_package.generated",
          resourceType: "package_artifact",
          resourceId: artifact.id,
          requestId: command.requestId,
          metadata: { responsePackageId: pkg.id, responsePackageVersionId: version.id, itemCount: manifestItems.length, checksum },
        });
        // V2 Sprint 16 (Integration Hub) — mission §87/§135 : même motif que Validate ci-dessus.
        await this.outboxWriter.write({
          organizationId: command.organizationId,
          events: [
            {
              eventType: "response_package.generated",
              aggregateType: "PackageArtifact",
              aggregateId: artifact.id,
              payload: { responsePackageId: pkg.id, responsePackageVersionId: version.id, tenderId: pkg.tenderId, lotId: pkg.lotId ?? null, clientAccountId: pkg.clientAccountId, fileName, checksum },
              occurredAt,
            },
          ],
        });
      });

      return { artifact };
    } catch (error) {
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "response_package.generation_failed",
        resourceType: "response_package_version",
        resourceId: version.id,
        requestId: command.requestId,
        metadata: { responsePackageId: pkg.id, reason: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }
}
