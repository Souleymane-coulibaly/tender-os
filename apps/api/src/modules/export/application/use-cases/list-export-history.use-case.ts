import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { toExportJobSummary, type ExportJobSummary } from "../dtos";
import { EXPORT_JOB_REPOSITORY, type ExportJobRepository } from "../ports/export-job.repository";

export type ListExportHistoryQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  mode?: string | undefined;
  limit: number;
  offset: number;
}>;

/** Mission Sprint 8A §22/§60 — historique COMPLET (aperçus et finaux), jamais seulement le
 *  dernier export (mission "export historique stable"). */
@Injectable()
export class ListExportHistoryUseCase {
  constructor(
    @Inject(EXPORT_JOB_REPOSITORY) private readonly exportJobRepository: ExportJobRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListExportHistoryQuery): Promise<{ items: readonly ExportJobSummary[]; total: number }> {
    const tender = await this.getTenderUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
    });

    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadExport,
    });

    const result = await this.exportJobRepository.list({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      mode: query.mode,
      limit: query.limit,
      offset: query.offset,
    });

    return { items: result.items.map(({ job, artifact }) => toExportJobSummary(job, artifact)), total: result.total };
  }
}
