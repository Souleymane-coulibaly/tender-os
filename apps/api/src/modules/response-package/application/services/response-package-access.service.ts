import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { ResponsePackageNotFoundError } from "../../domain/errors";
import type { ResponsePackage } from "../../domain/response-package.aggregate";
import { RESPONSE_PACKAGE_REPOSITORY, type ResponsePackageRepository } from "../ports/response-package.repository";

/**
 * Point d'entrée UNIQUE pour charger un ResponsePackage avec vérification RBAC + tenant + client —
 * même motif que `PricingScheduleAccessService`/`TechnicalMemoAccessService` : charge le Tender
 * (org-tier déjà vérifié par l'appelant via `assertResponsePackageTenderAccess`) puis revérifie le
 * ClientAccess AU MOMENT DE LA REQUÊTE (mission §80/§83 — jamais seulement
 * `createdBy === currentUser`, jamais un accès hérité d'une vérification passée).
 */
@Injectable()
export class ResponsePackageAccessService {
  constructor(
    @Inject(RESPONSE_PACKAGE_REPOSITORY) private readonly responsePackageRepository: ResponsePackageRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async loadPackage(input: { organizationId: string; actorId: string; actorRole: string; responsePackageId: string; permission: ClientPermission }): Promise<ResponsePackage> {
    const pkg = await this.responsePackageRepository.findById({ organizationId: input.organizationId, responsePackageId: input.responsePackageId });
    if (!pkg) {
      throw new ResponsePackageNotFoundError();
    }
    await this.assertClientAccessUseCase.execute({
      organizationId: input.organizationId,
      clientAccountId: pkg.clientAccountId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      permission: input.permission,
    });
    return pkg;
  }

  /** Vérifie l'accès au Tender SANS exiger qu'un dossier existe déjà — utilisé par
   *  `CreateResponsePackageUseCase`/`ListResponsePackagesUseCase`. */
  async assertTenderAccess(input: { organizationId: string; actorId: string; actorRole: string; tenderId: string; permission: ClientPermission }): Promise<string> {
    const tender = await this.getTenderUseCase.execute({
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });
    await this.assertClientAccessUseCase.execute({
      organizationId: input.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      permission: input.permission,
    });
    return tender.clientAccountId;
  }
}
