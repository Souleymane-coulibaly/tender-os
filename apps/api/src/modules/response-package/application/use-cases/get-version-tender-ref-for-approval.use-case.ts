import { Inject, Injectable } from "@nestjs/common";
import { RESPONSE_PACKAGE_REPOSITORY, type ResponsePackageRepository } from "../ports/response-package.repository";
import { RESPONSE_PACKAGE_VERSION_REPOSITORY, type ResponsePackageVersionRepository } from "../ports/response-package-version.repository";

export type ResponsePackageVersionTenderRef = Readonly<{ versionId: string; responsePackageId: string; tenderId: string; status: string }>;

/** V2 Sprint 18 — réexporté UNIQUEMENT pour `workspace` (mission §25/§26/§43-46 : une
 *  ApprovalRequest ciblant RESPONSE_PACKAGE_VERSION — l'équivalent "FinalApproval" du package avant
 *  dépôt, décision AskUserQuestion "étendre ApprovalRequest plutôt que retrofiter le FinalApproval
 *  legacy Tender-only" — doit vérifier que cette version appartient bien au Tender de la demande ET
 *  connaître son statut (VALIDATED exigé) AVANT toute écriture. Lecture pure, aucune vérification
 *  de permission ici (déjà portée par `ManageWorkspace`/`ValidateWorkspace` côté workspace). */
@Injectable()
export class GetVersionTenderRefForApprovalUseCase {
  constructor(
    @Inject(RESPONSE_PACKAGE_VERSION_REPOSITORY) private readonly versionRepository: ResponsePackageVersionRepository,
    @Inject(RESPONSE_PACKAGE_REPOSITORY) private readonly packageRepository: ResponsePackageRepository,
  ) {}

  async execute(input: { organizationId: string; responsePackageVersionId: string }): Promise<ResponsePackageVersionTenderRef | null> {
    const version = await this.versionRepository.findById({ organizationId: input.organizationId, responsePackageVersionId: input.responsePackageVersionId });
    if (!version) return null;
    const pkg = await this.packageRepository.findById({ organizationId: input.organizationId, responsePackageId: version.responsePackageId });
    if (!pkg) return null;
    return { versionId: version.id, responsePackageId: pkg.id, tenderId: pkg.tenderId, status: version.status };
  }
}
