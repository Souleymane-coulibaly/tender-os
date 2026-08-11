import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { TENDER_LOT_REPOSITORY, assertLotBelongsToTender, type TenderLotRepository } from "../../../tenders";
import type { ResponsePackage } from "../../domain/response-package.aggregate";
import { assertResponsePackageTenderAccess } from "../policies/response-package-access.policy";
import { ResponsePackageAccessService } from "../services/response-package-access.service";
import { RESPONSE_PACKAGE_REPOSITORY, type ResponsePackageRepository } from "../ports/response-package.repository";

export type ListResponsePackagesQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  lotId?: string | undefined;
}>;

/** Liste les dossiers de réponse d'un Tender (mission — onglet "Dossier final") — jamais un seul
 *  par lot si plusieurs candidats/périmètres coexistent. */
@Injectable()
export class ListResponsePackagesUseCase {
  constructor(
    @Inject(RESPONSE_PACKAGE_REPOSITORY) private readonly responsePackageRepository: ResponsePackageRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly tenderLotRepository: TenderLotRepository,
    private readonly accessService: ResponsePackageAccessService,
  ) {}

  async execute(query: ListResponsePackagesQuery): Promise<readonly ResponsePackage[]> {
    const clientAccountId = await assertResponsePackageTenderAccess(this.accessService, {
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      clientPermission: ClientPermission.ReadResponsePackage,
    });

    await assertLotBelongsToTender(this.tenderLotRepository, { organizationId: query.organizationId, tenderId: query.tenderId, lotId: query.lotId });

    return this.responsePackageRepository.list({ organizationId: query.organizationId, tenderId: query.tenderId, lotId: query.lotId, clientAccountId });
  }
}
