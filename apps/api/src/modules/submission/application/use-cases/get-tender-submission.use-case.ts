import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { TenderSubmissionNotFoundError } from "../../domain/errors";
import { toTenderSubmissionSummary, type TenderSubmissionSummary } from "../dtos";
import { SUBMISSION_PROOF_REPOSITORY, type SubmissionProofRepository } from "../ports/submission-proof.repository";
import { TENDER_SUBMISSION_REPOSITORY, type TenderSubmissionRepository } from "../ports/tender-submission.repository";
import { SubmissionAccessService } from "../services/submission-access.service";

export type GetTenderSubmissionQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; submissionId: string }>;

@Injectable()
export class GetTenderSubmissionUseCase {
  constructor(
    private readonly accessService: SubmissionAccessService,
    @Inject(TENDER_SUBMISSION_REPOSITORY) private readonly submissionRepository: TenderSubmissionRepository,
    @Inject(SUBMISSION_PROOF_REPOSITORY) private readonly proofRepository: SubmissionProofRepository,
  ) {}

  async execute(query: GetTenderSubmissionQuery): Promise<TenderSubmissionSummary> {
    const submission = await this.submissionRepository.findById({ organizationId: query.organizationId, submissionId: query.submissionId });
    if (!submission) {
      throw new TenderSubmissionNotFoundError();
    }
    await this.accessService.assertTenderAccess({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: submission.tenderId, permission: ClientPermission.ReadSubmission });

    const [proofs, responsePackageProvenance] = await Promise.all([
      this.proofRepository.listBySubmission({ organizationId: query.organizationId, submissionId: submission.id }),
      // Checkpoint TENDEROS-2.1-P2.2-F2.3 — relit la provenance MULTI-LOT figée (mode LOT
      // uniquement, `[]` pour le mode global/toute Submission antérieure à F2.3), jamais recalculée.
      this.submissionRepository.listResponsePackageProvenance({ organizationId: query.organizationId, submissionId: submission.id }),
    ]);
    return toTenderSubmissionSummary(submission, proofs, responsePackageProvenance);
  }
}
