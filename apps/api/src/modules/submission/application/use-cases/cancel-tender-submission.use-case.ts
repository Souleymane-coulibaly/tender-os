import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { TenderSubmissionNotFoundError } from "../../domain/errors";
import { toTenderSubmissionSummary, type TenderSubmissionSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_SUBMISSION_REPOSITORY, type TenderSubmissionRepository } from "../ports/tender-submission.repository";
import { SubmissionAccessService } from "../services/submission-access.service";

export type CancelTenderSubmissionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  submissionId: string;
  cancellationReason?: string | undefined;
}>;

/** Mission §15 — annule un dépôt SUBMISSION_IN_PROGRESS (jamais un dépôt déjà SUBMITTED, qui
 *  relève du retrait explicite via `WithdrawTenderSubmissionUseCase`). */
@Injectable()
export class CancelTenderSubmissionUseCase {
  constructor(
    private readonly accessService: SubmissionAccessService,
    @Inject(TENDER_SUBMISSION_REPOSITORY) private readonly submissionRepository: TenderSubmissionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CancelTenderSubmissionCommand): Promise<TenderSubmissionSummary> {
    const submission = await this.submissionRepository.findById({ organizationId: command.organizationId, submissionId: command.submissionId });
    if (!submission) {
      throw new TenderSubmissionNotFoundError();
    }
    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: submission.tenderId, permission: ClientPermission.ManageSubmission });

    submission.cancel({ cancelledByUserId: command.actorId, cancellationReason: command.cancellationReason, occurredAt: this.clock.now() });
    await this.submissionRepository.save(submission);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "TENDER_SUBMISSION_CANCELLED",
      resourceType: "TENDER_SUBMISSION",
      resourceId: submission.id,
    });

    return toTenderSubmissionSummary(submission, []);
  }
}
