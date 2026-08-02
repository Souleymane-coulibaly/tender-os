import { Inject, Injectable } from "@nestjs/common";
import type { Readable } from "node:stream";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { STORAGE_PROVIDER, type StorageProvider } from "../../../documents";
import { PackageNotReadyError, SubmissionPackageNotFoundError } from "../../domain/errors";
import { SUBMISSION_PACKAGE_REPOSITORY, type SubmissionPackageRepository } from "../ports/submission-package.repository";

export type DownloadSubmissionPackageQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; packageId: string }>;
export type SubmissionPackageDownload = Readonly<{ stream: Readable; contentType: string; filename: string; sizeBytes: number }>;

/** Mission Sprint 8A bis §50/§55 — même discipline qu'Export : jamais d'URL prestataire/publique,
 *  toujours un flux privé après vérification RBAC/tenant/client complète. */
@Injectable()
export class DownloadSubmissionPackageUseCase {
  constructor(
    @Inject(SUBMISSION_PACKAGE_REPOSITORY) private readonly submissionPackageRepository: SubmissionPackageRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: DownloadSubmissionPackageQuery): Promise<SubmissionPackageDownload> {
    const found = await this.submissionPackageRepository.findById({ organizationId: query.organizationId, packageId: query.packageId });
    if (!found) {
      throw new SubmissionPackageNotFoundError();
    }
    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: found.pkg.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadExport,
    });

    if (found.pkg.status !== "COMPLETED" || !found.pkg.storageKey || !found.pkg.fileName || !found.pkg.mimeType || !found.pkg.fileSize) {
      throw new PackageNotReadyError("this package has not completed generation yet");
    }

    const stream = await this.storageProvider.openReadStream(found.pkg.storageKey);
    return { stream, contentType: found.pkg.mimeType, filename: found.pkg.fileName, sizeBytes: found.pkg.fileSize };
  }
}
