import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { TenderSubmissionNotFoundError } from "../../domain/errors";
import { toTenderSubmissionSummary, type TenderSubmissionSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { SUBMISSION_PROOF_REPOSITORY, type SubmissionProofRepository } from "../ports/submission-proof.repository";
import { TENDER_SUBMISSION_REPOSITORY, type TenderSubmissionRepository } from "../ports/tender-submission.repository";
import { SubmissionAccessService } from "../services/submission-access.service";

export type WithdrawTenderSubmissionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  submissionId: string;
  withdrawalReason?: string | undefined;
}>;

/** Mission §15 — enregistre le retrait DANS TenderOS. N'effectue jamais le retrait réel sur la
 *  plateforme acheteur (l'avertissement correspondant est affiché côté frontend, mission §15). */
@Injectable()
export class WithdrawTenderSubmissionUseCase {
  constructor(
    private readonly accessService: SubmissionAccessService,
    @Inject(TENDER_SUBMISSION_REPOSITORY) private readonly submissionRepository: TenderSubmissionRepository,
    @Inject(SUBMISSION_PROOF_REPOSITORY) private readonly proofRepository: SubmissionProofRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: WithdrawTenderSubmissionCommand): Promise<TenderSubmissionSummary> {
    const submission = await this.submissionRepository.findById({ organizationId: command.organizationId, submissionId: command.submissionId });
    if (!submission) {
      throw new TenderSubmissionNotFoundError();
    }
    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: submission.tenderId, permission: ClientPermission.WithdrawSubmission });

    submission.withdraw({ withdrawnByUserId: command.actorId, withdrawalReason: command.withdrawalReason, occurredAt: this.clock.now() });
    await this.submissionRepository.save(submission);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "TENDER_SUBMISSION_WITHDRAWN",
      resourceType: "TENDER_SUBMISSION",
      resourceId: submission.id,
    });

    const proofs = await this.proofRepository.listBySubmission({ organizationId: command.organizationId, submissionId: submission.id });
    return toTenderSubmissionSummary(submission, proofs);
  }
}
