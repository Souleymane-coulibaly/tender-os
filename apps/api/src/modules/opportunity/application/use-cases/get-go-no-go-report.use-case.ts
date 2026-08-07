import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { assertHasTenderPermission, GetTenderUseCase, TenderPermission } from "../../../tenders";
import { GoNoGoReportNotFoundError } from "../../domain/errors";
import { GO_NO_GO_REPORT_REPOSITORY, type GoNoGoReportRecord, type GoNoGoReportRepository } from "../ports/go-no-go-report.repository";

export type GetGoNoGoReportQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
}>;

@Injectable()
export class GetGoNoGoReportUseCase {
  constructor(
    @Inject(GO_NO_GO_REPORT_REPOSITORY) private readonly repository: GoNoGoReportRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetGoNoGoReportQuery): Promise<GoNoGoReportRecord> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const tender = await this.getTenderUseCase.execute({ organizationId: query.organizationId, tenderId: query.tenderId, actorRole: query.actorRole });

    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadGoNoGo,
    });

    const latest = await this.repository.getLatest({ organizationId: query.organizationId, tenderId: query.tenderId });
    if (!latest) {
      throw new GoNoGoReportNotFoundError();
    }
    return latest;
  }
}
