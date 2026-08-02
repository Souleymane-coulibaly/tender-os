import { Inject, Injectable } from "@nestjs/common";
import type { Readable } from "node:stream";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { STORAGE_PROVIDER, type StorageProvider } from "../../../documents";
import { ExportArtifactNotFoundError, ExportJobNotFoundError } from "../../domain/errors";
import { EXPORT_JOB_REPOSITORY, type ExportJobRepository } from "../ports/export-job.repository";

export type DownloadExportArtifactQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; exportJobId: string }>;
export type ExportArtifactDownload = Readonly<{ stream: Readable; contentType: string; filename: string; sizeBytes: number }>;

/** Mission Sprint 8A §50/§55 — jamais une URL provider/publique permanente exposée : le fichier est
 *  toujours streamé depuis le stockage privé, après vérification RBAC/tenant/client complète. */
@Injectable()
export class DownloadExportArtifactUseCase {
  constructor(
    @Inject(EXPORT_JOB_REPOSITORY) private readonly exportJobRepository: ExportJobRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: DownloadExportArtifactQuery): Promise<ExportArtifactDownload> {
    const found = await this.exportJobRepository.findById({ organizationId: query.organizationId, exportJobId: query.exportJobId });
    if (!found) {
      throw new ExportJobNotFoundError();
    }
    if (!found.artifact) {
      throw new ExportArtifactNotFoundError();
    }

    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: found.job.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadExport,
    });

    const stream = await this.storageProvider.openReadStream(found.artifact.storageKey);
    return { stream, contentType: found.artifact.mimeType, filename: found.artifact.fileName, sizeBytes: found.artifact.fileSize };
  }
}
