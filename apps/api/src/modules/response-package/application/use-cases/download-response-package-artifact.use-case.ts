import { Inject, Injectable } from "@nestjs/common";
import type { Readable } from "node:stream";
import { ClientPermission } from "../../../client-portfolio";
import { STORAGE_PROVIDER, type StorageProvider } from "../../../documents";
import { ResponsePackageVersionNotFoundError } from "../../domain/errors";
import { assertResponsePackageAccess } from "../policies/response-package-access.policy";
import { ResponsePackageAccessService } from "../services/response-package-access.service";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { PACKAGE_ARTIFACT_REPOSITORY, type PackageArtifactRepository } from "../ports/package-artifact.repository";
import { RESPONSE_PACKAGE_VERSION_REPOSITORY, type ResponsePackageVersionRepository } from "../ports/response-package-version.repository";

export type DownloadResponsePackageArtifactQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  responsePackageId: string;
  responsePackageVersionId: string;
  requestId?: string | undefined;
}>;

export type ResponsePackageArtifactDownload = Readonly<{ stream: Readable; fileName: string; mimeType: string; sizeBytes: number }>;

/** Mission §65 — toutes les autorisations REVÉRIFIÉES côté backend, jamais une URL publique
 *  permanente : chaque téléchargement passe par ce use case, qui revalide `ClientAccess`/RBAC AU
 *  MOMENT DU TÉLÉCHARGEMENT (jamais un lien mis en cache côté frontend qui survivrait une
 *  révocation d'accès). */
@Injectable()
export class DownloadResponsePackageArtifactUseCase {
  constructor(
    @Inject(RESPONSE_PACKAGE_VERSION_REPOSITORY) private readonly versionRepository: ResponsePackageVersionRepository,
    @Inject(PACKAGE_ARTIFACT_REPOSITORY) private readonly artifactRepository: PackageArtifactRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    private readonly accessService: ResponsePackageAccessService,
  ) {}

  async execute(query: DownloadResponsePackageArtifactQuery): Promise<ResponsePackageArtifactDownload> {
    const pkg = await assertResponsePackageAccess(this.accessService, {
      organizationId: query.organizationId,
      responsePackageId: query.responsePackageId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      clientPermission: ClientPermission.DownloadResponsePackage,
    });

    const version = await this.versionRepository.findById({ organizationId: query.organizationId, responsePackageVersionId: query.responsePackageVersionId });
    if (!version || version.responsePackageId !== pkg.id) {
      throw new ResponsePackageVersionNotFoundError();
    }

    const artifacts = await this.artifactRepository.listByVersion({ organizationId: query.organizationId, responsePackageVersionId: version.id });
    const latest = artifacts[0];
    if (!latest) {
      throw new ResponsePackageVersionNotFoundError();
    }

    const stream = await this.storageProvider.openReadStream(latest.storageKey);

    await this.auditLogWriter.record({
      organizationId: query.organizationId,
      actorType: "USER",
      actorId: query.actorId,
      action: "response_package.downloaded",
      resourceType: "package_artifact",
      resourceId: latest.id,
      requestId: query.requestId,
      metadata: { responsePackageId: pkg.id, responsePackageVersionId: version.id },
    });

    return { stream, fileName: latest.fileName, mimeType: latest.mimeType, sizeBytes: latest.sizeBytes };
  }
}
