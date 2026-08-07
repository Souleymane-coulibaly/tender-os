import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { assertHasTenderPermission, GetTenderUseCase, TenderPermission } from "../../../tenders";
import { GO_NO_GO_REPORT_REPOSITORY, type GoNoGoReportRecord, type GoNoGoReportRepository } from "../ports/go-no-go-report.repository";

export type ListGoNoGoReportsQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
}>;

/** Historique complet des versions, la plus récente d'abord (mission §29). */
@Injectable()
export class ListGoNoGoReportsUseCase {
  constructor(
    @Inject(GO_NO_GO_REPORT_REPOSITORY) private readonly repository: GoNoGoReportRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListGoNoGoReportsQuery): Promise<GoNoGoReportRecord[]> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const tender = await this.getTenderUseCase.execute({ organizationId: query.organizationId, tenderId: query.tenderId, actorRole: query.actorRole });

    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadGoNoGo,
    });

    return this.repository.listVersions({ organizationId: query.organizationId, tenderId: query.tenderId });
  }
}
