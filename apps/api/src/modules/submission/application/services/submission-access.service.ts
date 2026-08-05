import { Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase, type TenderSummary } from "../../../tenders";

/**
 * Sprint 9 — point d'entrée UNIQUE pour vérifier l'accès Tender+organisation+permission avant toute
 * action de suivi de dépôt (même motif que `AdministrativeDossierAccessService`, mission §30
 * "jamais faire confiance à un organizationId fourni par le frontend").
 */
@Injectable()
export class SubmissionAccessService {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async assertTenderAccess(input: {
    organizationId: string;
    actorId: string;
    actorRole: string;
    tenderId: string;
    permission: ClientPermission;
  }): Promise<TenderSummary> {
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
    return tender;
  }
}
