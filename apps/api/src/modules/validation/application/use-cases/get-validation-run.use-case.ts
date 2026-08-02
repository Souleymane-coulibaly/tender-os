import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { ValidationRunNotFoundError } from "../../domain/errors";
import { toValidationRunSummary, type ValidationRunSummary } from "../dtos";
import { VALIDATION_RUN_REPOSITORY, type ValidationRunRepository } from "../ports/validation-run.repository";

export type GetValidationRunQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string; validationRunId?: string | undefined }>;

/** Sans `validationRunId`, retourne le run le PLUS RÉCENT du Tender (mission §30 "readiness
 *  calculé côté backend"). */
@Injectable()
export class GetValidationRunUseCase {
  constructor(
    @Inject(VALIDATION_RUN_REPOSITORY) private readonly validationRunRepository: ValidationRunRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetValidationRunQuery): Promise<ValidationRunSummary> {
    const tender = await this.getTenderUseCase.execute({ organizationId: query.organizationId, tenderId: query.tenderId, actorId: query.actorId, actorRole: query.actorRole });
    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadExport,
    });

    const run = query.validationRunId
      ? await this.validationRunRepository.findById({ organizationId: query.organizationId, validationRunId: query.validationRunId })
      : (await this.validationRunRepository.list({ organizationId: query.organizationId, tenderId: query.tenderId, limit: 1, offset: 0 })).items[0];

    if (!run) {
      throw new ValidationRunNotFoundError();
    }

    return toValidationRunSummary(run);
  }
}
