import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { EXPORT_JOB_REPOSITORY, type ExportJobRepository } from "../../../export";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ValidationIssueNotFoundError, ValidationRunNotFoundError } from "../../domain/errors";
import { toValidationIssueSummary, type ValidationIssueSummary } from "../dtos";
import { VALIDATION_RUN_REPOSITORY, type ValidationRunRepository } from "../ports/validation-run.repository";

export type ResolveValidationIssueCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  issueId: string;
  resolutionNote: string;
}>;

@Injectable()
export class ResolveValidationIssueUseCase {
  constructor(
    @Inject(VALIDATION_RUN_REPOSITORY) private readonly validationRunRepository: ValidationRunRepository,
    @Inject(EXPORT_JOB_REPOSITORY) private readonly exportJobRepository: ExportJobRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ResolveValidationIssueCommand): Promise<ValidationIssueSummary> {
    const issue = await this.validationRunRepository.findIssueById({ organizationId: command.organizationId, issueId: command.issueId });
    if (!issue) {
      throw new ValidationIssueNotFoundError();
    }
    const run = await this.validationRunRepository.findById({ organizationId: command.organizationId, validationRunId: issue.validationRunId });
    if (!run) {
      throw new ValidationRunNotFoundError();
    }
    const exportJob = await this.exportJobRepository.findById({ organizationId: command.organizationId, exportJobId: run.exportJobId });

    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: exportJob?.job.clientAccountId ?? run.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageExport,
    });

    issue.resolve({ resolvedBy: command.actorId, resolutionNote: command.resolutionNote, occurredAt: this.clock.now() });
    await this.validationRunRepository.saveIssue(issue);

    return toValidationIssueSummary(issue);
  }
}
