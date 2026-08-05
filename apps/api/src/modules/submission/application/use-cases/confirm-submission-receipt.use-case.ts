import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { ReceiptConfirmationRequiresEvidenceError, TenderSubmissionNotFoundError } from "../../domain/errors";
import { toTenderSubmissionSummary, type TenderSubmissionSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { SUBMISSION_PROOF_REPOSITORY, type SubmissionProofRepository } from "../ports/submission-proof.repository";
import { TENDER_SUBMISSION_REPOSITORY, type TenderSubmissionRepository } from "../ports/tender-submission.repository";
import { SubmissionAccessService } from "../services/submission-access.service";

export type ConfirmSubmissionReceiptCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  submissionId: string;
  receiptReference?: string | undefined;
  /** Confirmation humaine explicite lorsqu'aucune référence de reçu ni preuve n'est disponible
   *  (mission §13 "ou une confirmation humaine explicite selon les règles retenues"). */
  confirmedWithoutEvidence?: boolean | undefined;
}>;

/** Mission §13 — exige au minimum une référence de reçu, une preuve déjà ajoutée, ou une
 *  confirmation humaine EXPLICITE — jamais une confirmation silencieuse par défaut. */
@Injectable()
export class ConfirmSubmissionReceiptUseCase {
  constructor(
    private readonly accessService: SubmissionAccessService,
    @Inject(TENDER_SUBMISSION_REPOSITORY) private readonly submissionRepository: TenderSubmissionRepository,
    @Inject(SUBMISSION_PROOF_REPOSITORY) private readonly proofRepository: SubmissionProofRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ConfirmSubmissionReceiptCommand): Promise<TenderSubmissionSummary> {
    const submission = await this.submissionRepository.findById({ organizationId: command.organizationId, submissionId: command.submissionId });
    if (!submission) {
      throw new TenderSubmissionNotFoundError();
    }
    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: submission.tenderId, permission: ClientPermission.ConfirmSubmission });

    const hasReceiptReference = Boolean(command.receiptReference?.trim() || submission.receiptReference?.trim());
    const proofs = await this.proofRepository.listBySubmission({ organizationId: command.organizationId, submissionId: submission.id });
    if (!hasReceiptReference && proofs.length === 0 && !command.confirmedWithoutEvidence) {
      throw new ReceiptConfirmationRequiresEvidenceError();
    }

    submission.confirmReceipt({ receiptReference: command.receiptReference, confirmedByUserId: command.actorId, occurredAt: this.clock.now() });
    await this.submissionRepository.save(submission);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "TENDER_SUBMISSION_RECEIPT_CONFIRMED",
      resourceType: "TENDER_SUBMISSION",
      resourceId: submission.id,
    });

    return toTenderSubmissionSummary(submission, proofs);
  }
}
