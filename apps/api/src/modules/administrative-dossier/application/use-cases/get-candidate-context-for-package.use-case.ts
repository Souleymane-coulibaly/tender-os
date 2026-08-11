import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { CONSORTIUM_REPOSITORY, type ConsortiumRepository } from "../ports/consortium.repository";
import { SUBCONTRACTOR_DECLARATION_REPOSITORY, type SubcontractorDeclarationRepository } from "../ports/subcontractor-declaration.repository";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";

export type GetCandidateContextForPackageQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/** Signal minimal nécessaire pour évaluer l'applicabilité d'une pièce CONDITIONAL (mission §39/§40
 *  "sous-traitant présent/groupement présent") — jamais un second calcul divergent, jamais une
 *  supposition en l'absence de déclaration. */
export type CandidateContextForPackage = Readonly<{
  isConsortiumBid: boolean;
  hasDeclaredSubcontractors: boolean;
}>;

/**
 * Sprint 14 — port en LECTURE SEULE réexporté pour `response-package` (même motif que
 * `ListValidatedAdministrativeDocumentsForPackageUseCase`) : donne le signal de présence
 * groupement/sous-traitant DÉJÀ déclaré dans le dossier administratif, jamais un second système de
 * déclaration.
 */
@Injectable()
export class GetCandidateContextForPackageUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    @Inject(CONSORTIUM_REPOSITORY) private readonly consortiumRepository: ConsortiumRepository,
    @Inject(SUBCONTRACTOR_DECLARATION_REPOSITORY) private readonly subcontractorDeclarationRepository: SubcontractorDeclarationRepository,
  ) {}

  async execute(query: GetCandidateContextForPackageQuery): Promise<CandidateContextForPackage> {
    await this.accessService.assertTenderAccess({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId, permission: ClientPermission.ReadAdministrativeDossier });

    const [consortium, subcontractorDeclarations] = await Promise.all([
      this.consortiumRepository.findByTenderId({ organizationId: query.organizationId, tenderId: query.tenderId }),
      this.subcontractorDeclarationRepository.listByTenderId({ organizationId: query.organizationId, tenderId: query.tenderId }),
    ]);

    return { isConsortiumBid: consortium !== null, hasDeclaredSubcontractors: subcontractorDeclarations.length > 0 };
  }
}
