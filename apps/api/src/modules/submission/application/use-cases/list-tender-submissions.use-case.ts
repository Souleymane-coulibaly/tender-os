import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { toTenderSubmissionSummary, type TenderSubmissionSummary } from "../dtos";
import { SUBMISSION_PROOF_REPOSITORY, type SubmissionProofRepository } from "../ports/submission-proof.repository";
import { TENDER_SUBMISSION_REPOSITORY, type TenderSubmissionRepository } from "../ports/tender-submission.repository";
import { SubmissionAccessService } from "../services/submission-access.service";

export type ListTenderSubmissionsQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

/** Mission §17/§25 — historique complet, jamais filtré/écrasé. */
@Injectable()
export class ListTenderSubmissionsUseCase {
  constructor(
    private readonly accessService: SubmissionAccessService,
    @Inject(TENDER_SUBMISSION_REPOSITORY) private readonly submissionRepository: TenderSubmissionRepository,
    @Inject(SUBMISSION_PROOF_REPOSITORY) private readonly proofRepository: SubmissionProofRepository,
  ) {}

  async execute(query: ListTenderSubmissionsQuery): Promise<readonly TenderSubmissionSummary[]> {
    await this.accessService.assertTenderAccess({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId, permission: ClientPermission.ReadSubmission });

    const submissions = await this.submissionRepository.listByTender({ organizationId: query.organizationId, tenderId: query.tenderId });
    return Promise.all(
      submissions.map(async (submission) => {
        const [proofs, responsePackageProvenance] = await Promise.all([
          this.proofRepository.listBySubmission({ organizationId: query.organizationId, submissionId: submission.id }),
          // Checkpoint TENDEROS-2.1-P2.2-F2.3.1 — relit la provenance MULTI-LOT figée (mode LOT
          // uniquement, `[]` pour le mode global/toute Submission antérieure à F2.3), jamais
          // recalculée depuis le Tender courant (mission §18) — même lecture que GET détail
          // (mission §22 "parité detail/list").
          this.submissionRepository.listResponsePackageProvenance({ organizationId: query.organizationId, submissionId: submission.id }),
        ]);
        return toTenderSubmissionSummary(submission, proofs, responsePackageProvenance);
      }),
    );
  }
}
