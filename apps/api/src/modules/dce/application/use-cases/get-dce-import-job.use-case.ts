import { Inject, Injectable } from "@nestjs/common";
import { GetTenderUseCase } from "../../../tenders";
import { DceImportJobNotFoundError } from "../../domain/errors";
import { DcePermission } from "../../domain/dce-permission";
import { assertHasDcePermission } from "../policies/dce-authorization.policy";
import { toDceImportJobSummary, type DceImportJobSummary } from "../dtos";
import { DCE_IMPORT_JOB_REPOSITORY, type DceImportJobRepository } from "../ports/dce-import-job.repository";

export type GetDceImportJobQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  jobId: string;
}>;

/** Lecture de suivi (mission Sprint 8A.2, correction bug #3) — permet au frontend de sonder la
 *  progression sans jamais tenir la requête HTTP d'import elle-même ouverte. Même chaîne
 *  d'autorisation que le reste du module DCE : Tender → permission DCE. */
@Injectable()
export class GetDceImportJobUseCase {
  constructor(
    @Inject(DCE_IMPORT_JOB_REPOSITORY) private readonly jobRepository: DceImportJobRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
  ) {}

  async execute(query: GetDceImportJobQuery): Promise<DceImportJobSummary> {
    assertHasDcePermission(query.actorRole, DcePermission.Read);

    await this.getTenderUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorRole: query.actorRole,
      actorId: query.actorId,
    });

    const job = await this.jobRepository.findById({ organizationId: query.organizationId, jobId: query.jobId });
    if (!job || job.tenderId !== query.tenderId) {
      throw new DceImportJobNotFoundError();
    }

    return toDceImportJobSummary(job);
  }
}
