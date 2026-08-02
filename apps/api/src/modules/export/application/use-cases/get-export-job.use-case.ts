import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { ExportJobNotFoundError } from "../../domain/errors";
import { toExportJobSummary, type ExportJobSummary } from "../dtos";
import { EXPORT_JOB_REPOSITORY, type ExportJobRepository } from "../ports/export-job.repository";

export type GetExportJobQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; exportJobId: string }>;

@Injectable()
export class GetExportJobUseCase {
  constructor(
    @Inject(EXPORT_JOB_REPOSITORY) private readonly exportJobRepository: ExportJobRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetExportJobQuery): Promise<ExportJobSummary> {
    const found = await this.exportJobRepository.findById({ organizationId: query.organizationId, exportJobId: query.exportJobId });
    if (!found) {
      throw new ExportJobNotFoundError();
    }

    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: found.job.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadExport,
    });

    return toExportJobSummary(found.job, found.artifact);
  }
}
