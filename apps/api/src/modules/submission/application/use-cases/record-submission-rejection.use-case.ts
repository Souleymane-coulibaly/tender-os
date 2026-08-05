import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { TenderSubmissionNotFoundError } from "../../domain/errors";
import type { SubmissionRejectionCategory } from "../../domain/submission-rejection-category";
import { toTenderSubmissionSummary, type TenderSubmissionSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { SUBMISSION_PROOF_REPOSITORY, type SubmissionProofRepository } from "../ports/submission-proof.repository";
import { TENDER_SUBMISSION_REPOSITORY, type TenderSubmissionRepository } from "../ports/tender-submission.repository";
import { SubmissionAccessService } from "../services/submission-access.service";

export type RecordSubmissionRejectionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  submissionId: string;
  rejectionCategory: SubmissionRejectionCategory;
  rejectionDescription: string;
}>;

/** Mission §16 — rejet/échec technique. Le cockpit propose ensuite corriger/générer une nouvelle
 *  version/redéposer (mission §16, calculé par les capabilities, jamais par une réponse IA). */
@Injectable()
export class RecordSubmissionRejectionUseCase {
  constructor(
    private readonly accessService: SubmissionAccessService,
    @Inject(TENDER_SUBMISSION_REPOSITORY) private readonly submissionRepository: TenderSubmissionRepository,
    @Inject(SUBMISSION_PROOF_REPOSITORY) private readonly proofRepository: SubmissionProofRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RecordSubmissionRejectionCommand): Promise<TenderSubmissionSummary> {
    const submission = await this.submissionRepository.findById({ organizationId: command.organizationId, submissionId: command.submissionId });
    if (!submission) {
      throw new TenderSubmissionNotFoundError();
    }
    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: submission.tenderId, permission: ClientPermission.ManageSubmission });

    submission.reject({ rejectionCategory: command.rejectionCategory, rejectionDescription: command.rejectionDescription, occurredAt: this.clock.now() });
    await this.submissionRepository.save(submission);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "TENDER_SUBMISSION_REJECTED",
      resourceType: "TENDER_SUBMISSION",
      resourceId: submission.id,
      metadata: { rejectionCategory: command.rejectionCategory },
    });

    const proofs = await this.proofRepository.listBySubmission({ organizationId: command.organizationId, submissionId: submission.id });
    return toTenderSubmissionSummary(submission, proofs);
  }
}
