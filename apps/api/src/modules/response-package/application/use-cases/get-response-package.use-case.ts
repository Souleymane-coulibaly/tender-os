import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import type { PackageArtifact } from "../../domain/package-artifact.value-object";
import type { PackageItem } from "../../domain/package-item.entity";
import type { ResponsePackageVersion } from "../../domain/response-package-version.entity";
import type { ResponsePackage } from "../../domain/response-package.aggregate";
import { assertResponsePackageAccess } from "../policies/response-package-access.policy";
import { ResponsePackageAccessService } from "../services/response-package-access.service";
import { PACKAGE_ARTIFACT_REPOSITORY, type PackageArtifactRepository } from "../ports/package-artifact.repository";
import { PACKAGE_ITEM_REPOSITORY, type PackageItemRepository } from "../ports/package-item.repository";
import { RESPONSE_PACKAGE_VERSION_REPOSITORY, type ResponsePackageVersionRepository } from "../ports/response-package-version.repository";

export type GetResponsePackageQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  responsePackageId: string;
  /** Si fourni, charge aussi les pièces/artefacts de CETTE version précise (jamais implicitement
   *  "la courante"). */
  responsePackageVersionId?: string | undefined;
}>;

export type GetResponsePackageResult = Readonly<{
  responsePackage: ResponsePackage;
  versions: readonly ResponsePackageVersion[];
  items: readonly PackageItem[];
  artifacts: readonly PackageArtifact[];
}>;

/** Lecture — revérifie le ClientAccess À CHAQUE APPEL, jamais un accès mis en cache. */
@Injectable()
export class GetResponsePackageUseCase {
  constructor(
    @Inject(RESPONSE_PACKAGE_VERSION_REPOSITORY) private readonly versionRepository: ResponsePackageVersionRepository,
    @Inject(PACKAGE_ITEM_REPOSITORY) private readonly itemRepository: PackageItemRepository,
    @Inject(PACKAGE_ARTIFACT_REPOSITORY) private readonly artifactRepository: PackageArtifactRepository,
    private readonly accessService: ResponsePackageAccessService,
  ) {}

  async execute(query: GetResponsePackageQuery): Promise<GetResponsePackageResult> {
    const responsePackage = await assertResponsePackageAccess(this.accessService, {
      organizationId: query.organizationId,
      responsePackageId: query.responsePackageId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      clientPermission: ClientPermission.ReadResponsePackage,
    });

    const versions = await this.versionRepository.list({ organizationId: query.organizationId, responsePackageId: responsePackage.id });

    let items: readonly PackageItem[] = [];
    let artifacts: readonly PackageArtifact[] = [];
    if (query.responsePackageVersionId) {
      const targetVersion = versions.find((v) => v.id === query.responsePackageVersionId);
      if (targetVersion) {
        [items, artifacts] = await Promise.all([
          this.itemRepository.listByVersion({ organizationId: query.organizationId, responsePackageVersionId: targetVersion.id }),
          this.artifactRepository.listByVersion({ organizationId: query.organizationId, responsePackageVersionId: targetVersion.id }),
        ]);
      }
    }

    return { responsePackage, versions, items, artifacts };
  }
}
