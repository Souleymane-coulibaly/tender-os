import { Inject, Injectable } from "@nestjs/common";
import { ResponsePackageNotFoundError } from "../../domain/errors";
import { RESPONSE_PACKAGE_REPOSITORY, type ResponsePackageRepository } from "../ports/response-package.repository";

export type GetResponsePackageForPublicApiQuery = Readonly<{ organizationId: string; responsePackageId: string; restrictToClientAccountIds?: readonly string[] | undefined }>;

export type ResponsePackagePublicSummary = Readonly<{
  id: string;
  tenderId: string;
  lotId: string | undefined;
  clientAccountId: string;
  status: string;
  currentVersionNumber: number;
}>;

/** V2 Sprint 16 — mission §85/§86 : metadata uniquement (id/tender/lot/candidate/status/version),
 *  jamais le contenu du ZIP ni un `storageKey` (mission §82/§83, téléchargement différé — voir
 *  rapport §"éléments différés"). `status` EST la readiness dénormalisée (mission §64, jamais
 *  recalculée ici). Anti-énumération : hors périmètre = 404, jamais un 403. */
@Injectable()
export class GetResponsePackageForPublicApiUseCase {
  constructor(@Inject(RESPONSE_PACKAGE_REPOSITORY) private readonly repository: ResponsePackageRepository) {}

  async execute(query: GetResponsePackageForPublicApiQuery): Promise<ResponsePackagePublicSummary> {
    const pkg = await this.repository.findById({ organizationId: query.organizationId, responsePackageId: query.responsePackageId });
    if (!pkg) {
      throw new ResponsePackageNotFoundError();
    }
    if (query.restrictToClientAccountIds && !query.restrictToClientAccountIds.includes(pkg.clientAccountId)) {
      throw new ResponsePackageNotFoundError();
    }

    return { id: pkg.id, tenderId: pkg.tenderId, lotId: pkg.lotId, clientAccountId: pkg.clientAccountId, status: pkg.status, currentVersionNumber: pkg.currentVersionNumber };
  }
}
