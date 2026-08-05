import { Inject, Injectable } from "@nestjs/common";
import { GetTenderUseCase } from "../../../tenders";
import { SubcontractorDeclarationNotFoundError } from "../../domain/errors";
import type { SubcontractorDeclaration } from "../../domain/subcontractor-declaration.aggregate";
import { SUBCONTRACTOR_DECLARATION_REPOSITORY, type SubcontractorDeclarationRepository } from "../ports/subcontractor-declaration.repository";

export type Dc4FormSourceData = Readonly<{
  declaration: SubcontractorDeclaration;
  tenderId: string;
  tenderTitle: string;
}>;

/**
 * Sprint 8C.1 — charge les données SOURCE (agrégats Phase 1/2 déjà existants + Tender) nécessaires
 * à un mapper de formulaire officiel, sans jamais imposer l'autorisation elle-même (mission :
 * l'accès reste vérifié dans le use case appelant via `AdministrativeDossierAccessService`, même
 * séparation que les générateurs PDF Phase 3). Un seul point de chargement par formulaire pour que
 * Prepare/Preview/Generate n'aient jamais 3 implémentations divergentes de la même lecture.
 */
@Injectable()
export class AdministrativeFormDataAssembler {
  constructor(
    @Inject(SUBCONTRACTOR_DECLARATION_REPOSITORY) private readonly subcontractorRepository: SubcontractorDeclarationRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
  ) {}

  async assembleForDc4(input: { organizationId: string; actorId: string; actorRole: string; subcontractorDeclarationId: string }): Promise<Dc4FormSourceData> {
    const declaration = await this.subcontractorRepository.findById({
      organizationId: input.organizationId,
      subcontractorDeclarationId: input.subcontractorDeclarationId,
    });
    if (!declaration) throw new SubcontractorDeclarationNotFoundError();

    const tender = await this.getTenderUseCase.execute({
      organizationId: input.organizationId,
      tenderId: declaration.tenderId,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });

    return { declaration, tenderId: declaration.tenderId, tenderTitle: tender.title };
  }
}
