import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { computePackageCompleteness, type PackageCompletenessResult } from "../../domain/services/compute-package-completeness";
import { ResponsePackageVersionNotFoundError } from "../../domain/errors";
import { assertResponsePackageAccess } from "../policies/response-package-access.policy";
import { ResponsePackageAccessService } from "../services/response-package-access.service";
import { PACKAGE_ITEM_REPOSITORY, type PackageItemRepository } from "../ports/package-item.repository";
import { RESPONSE_PACKAGE_VERSION_REPOSITORY, type ResponsePackageVersionRepository } from "../ports/response-package-version.repository";

export type GetPackageCompletenessQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  responsePackageId: string;
  responsePackageVersionId: string;
}>;

/** Lecture seule (mission — même motif que les contrôles Sprint 13) : recalcule la complétude à
 *  chaque appel, ne persiste jamais un pourcentage figé. */
@Injectable()
export class GetPackageCompletenessUseCase {
  constructor(
    @Inject(RESPONSE_PACKAGE_VERSION_REPOSITORY) private readonly versionRepository: ResponsePackageVersionRepository,
    @Inject(PACKAGE_ITEM_REPOSITORY) private readonly itemRepository: PackageItemRepository,
    private readonly accessService: ResponsePackageAccessService,
  ) {}

  async execute(query: GetPackageCompletenessQuery): Promise<PackageCompletenessResult> {
    const pkg = await assertResponsePackageAccess(this.accessService, {
      organizationId: query.organizationId,
      responsePackageId: query.responsePackageId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      clientPermission: ClientPermission.ReadResponsePackage,
    });

    const version = await this.versionRepository.findById({ organizationId: query.organizationId, responsePackageVersionId: query.responsePackageVersionId });
    if (!version || version.responsePackageId !== pkg.id) {
      throw new ResponsePackageVersionNotFoundError();
    }

    const items = await this.itemRepository.listByVersion({ organizationId: query.organizationId, responsePackageVersionId: version.id });
    return computePackageCompleteness(items.map((item) => ({ id: item.id, label: item.label, requirementType: item.requirementType, applicabilityStatus: item.applicabilityStatus, hasDocumentVersion: item.documentVersionId !== undefined })));
  }
}
