import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { TenderNotFoundError } from "../../domain/errors";
import { TenderPermission } from "../../domain/tender-permission";
import { toTenderSummary, type TenderSummary } from "../dtos";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

/**
 * `actorId` est OPTIONNEL (mission Sprint 5.1 §"Policy d'accès client centralisée") — absent, le
 * comportement est strictement identique à avant Sprint 5.1 (compatibilité ascendante pour DCE/
 * Extraction, non explicitement listés par la mission pour l'isolation inter-clients). Présent, il
 * déclenche la vérification centralisée d'accès client (`AssertClientAccessUseCase`) : SEUL point
 * d'application pour tous les appelants qui le fournissent (Documents, Analysis, Tenders lui-même)
 * — jamais une logique recopiée dans chacun de ces modules.
 */
export type GetTenderQuery = Readonly<{ organizationId: string; tenderId: string; actorRole: string; actorId?: string | undefined }>;
export type GetTenderResult = TenderSummary;

@Injectable()
export class GetTenderUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetTenderQuery): Promise<GetTenderResult> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const tender = await this.tenderRepository.findById({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });

    if (!tender) {
      throw new TenderNotFoundError();
    }

    if (query.actorId) {
      await this.assertClientAccessUseCase.execute({
        organizationId: query.organizationId,
        clientAccountId: tender.clientAccountId,
        actorId: query.actorId,
        actorRole: query.actorRole,
        permission: ClientPermission.ReadTender,
      });
    }

    return toTenderSummary(tender);
  }
}
