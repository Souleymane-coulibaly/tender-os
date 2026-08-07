import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase, TenderPermission, assertHasTenderPermission } from "../../../tenders";
import { GO_NO_GO_DECISION_REPOSITORY, type GoNoGoDecisionRecord, type GoNoGoDecisionRepository } from "../ports/go-no-go-decision.repository";

export type ListTenderGoNoGoDecisionsQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
}>;

/** Historique complet, la plus récente d'abord (mission §18 "historique conservé, jamais écrasé"). */
@Injectable()
export class ListTenderGoNoGoDecisionsUseCase {
  constructor(
    @Inject(GO_NO_GO_DECISION_REPOSITORY) private readonly decisionRepository: GoNoGoDecisionRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListTenderGoNoGoDecisionsQuery): Promise<GoNoGoDecisionRecord[]> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const tender = await this.getTenderUseCase.execute({ organizationId: query.organizationId, tenderId: query.tenderId, actorRole: query.actorRole });

    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadGoNoGo,
    });

    return this.decisionRepository.listByTender({ organizationId: query.organizationId, tenderId: query.tenderId });
  }
}
