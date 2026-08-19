import { Inject, Injectable } from "@nestjs/common";
import { GetCandidateContextForPackageUseCase, ListValidatedAdministrativeDocumentsForPackageUseCase } from "../../../administrative-dossier";
import { ClientPermission } from "../../../client-portfolio";
import { ListFinalFilesForPackageUseCase } from "../../../pricing-schedule";
import { ListValidatedTechnicalMemosForPackageUseCase } from "../../../technical-memo";
import { CHECKLIST_ITEM_REPOSITORY, GetTenderUseCase, type ChecklistItemRepository } from "../../../tenders";
import { computeExpectedPackageItems } from "../../domain/services/compute-expected-package-items";
import { computeResponsePackageFreshness, ResponsePackageFreshness } from "../../domain/response-package-freshness";
import { assertResponsePackageAccess } from "../policies/response-package-access.policy";
import { ResponsePackageAccessService } from "../services/response-package-access.service";
import { PACKAGE_ITEM_REPOSITORY, type PackageItemRepository } from "../ports/package-item.repository";
import { RESPONSE_PACKAGE_VERSION_REPOSITORY, type ResponsePackageVersionRepository } from "../ports/response-package-version.repository";

export type GetResponsePackageFreshnessQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; responsePackageId: string }>;

export type ResponsePackageFreshnessResult = Readonly<{ freshness: ResponsePackageFreshness; currentVersionId: string | undefined; currentVersionNumber: number }>;

/**
 * Checkpoint 2.1-P2.1-FIX-E — jamais persistée, recalculée à chaque lecture. Compare la version
 * COURANTE (`ResponsePackage.currentVersionId` — jamais implicitement "la dernière", même
 * discipline que `GetResponsePackageUseCase`) à l'état ATTENDU recalculé MAINTENANT via
 * `computeExpectedPackageItems`, la MÊME fonction pure utilisée par
 * `BuildResponsePackageVersionUseCase` — jamais un second calcul divergent.
 */
@Injectable()
export class GetResponsePackageFreshnessUseCase {
  constructor(
    @Inject(RESPONSE_PACKAGE_VERSION_REPOSITORY) private readonly versionRepository: ResponsePackageVersionRepository,
    @Inject(PACKAGE_ITEM_REPOSITORY) private readonly itemRepository: PackageItemRepository,
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistItemRepository: ChecklistItemRepository,
    private readonly accessService: ResponsePackageAccessService,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly getCandidateContextForPackageUseCase: GetCandidateContextForPackageUseCase,
    private readonly listValidatedAdministrativeDocumentsForPackageUseCase: ListValidatedAdministrativeDocumentsForPackageUseCase,
    private readonly listValidatedTechnicalMemosForPackageUseCase: ListValidatedTechnicalMemosForPackageUseCase,
    private readonly listFinalFilesForPackageUseCase: ListFinalFilesForPackageUseCase,
  ) {}

  async execute(query: GetResponsePackageFreshnessQuery): Promise<ResponsePackageFreshnessResult> {
    const pkg = await assertResponsePackageAccess(this.accessService, {
      organizationId: query.organizationId,
      responsePackageId: query.responsePackageId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      clientPermission: ClientPermission.ReadResponsePackage,
    });

    if (!pkg.currentVersionId) {
      return { freshness: ResponsePackageFreshness.Unknown, currentVersionId: undefined, currentVersionNumber: pkg.currentVersionNumber };
    }

    const [version, persistedItems, tender, candidateContext, adminDocs, technicalMemos, finalFiles, checklistItems] = await Promise.all([
      this.versionRepository.findById({ organizationId: query.organizationId, responsePackageVersionId: pkg.currentVersionId }),
      this.itemRepository.listByVersion({ organizationId: query.organizationId, responsePackageVersionId: pkg.currentVersionId }),
      this.getTenderUseCase.execute({ organizationId: query.organizationId, tenderId: pkg.tenderId, actorId: query.actorId, actorRole: query.actorRole }),
      this.getCandidateContextForPackageUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: pkg.tenderId }),
      this.listValidatedAdministrativeDocumentsForPackageUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: pkg.tenderId }),
      this.listValidatedTechnicalMemosForPackageUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: pkg.tenderId }),
      this.listFinalFilesForPackageUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: pkg.tenderId, clientAccountId: pkg.clientAccountId }),
      this.checklistItemRepository.listByTender({ organizationId: query.organizationId, tenderId: pkg.tenderId }),
    ]);

    const currentExpectedItems = computeExpectedPackageItems({ packageLotId: pkg.lotId, checklistItems, candidateContext, adminDocs, technicalMemos, finalFiles });

    const freshness = computeResponsePackageFreshness({
      version: version
        ? {
            candidateCompanyId: version.candidateCompanyId,
            items: persistedItems.map((item) => ({
              sourceType: item.sourceType,
              sourceId: item.sourceId,
              documentVersionId: item.documentVersionId,
              requirementType: item.requirementType,
              applicabilityStatus: item.applicabilityStatus,
            })),
          }
        : null,
      currentCandidateCompanyId: tender.candidateCompanyId,
      currentExpectedItems,
    });

    return { freshness, currentVersionId: pkg.currentVersionId, currentVersionNumber: pkg.currentVersionNumber };
  }
}
