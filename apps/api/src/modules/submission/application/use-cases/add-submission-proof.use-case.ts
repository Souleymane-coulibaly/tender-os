import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { DomainError } from "../../../../shared-kernel/domain-error";
import { ClientPermission } from "../../../client-portfolio";
import { AttachDocumentToTenderUseCase, GetDocumentUseCase } from "../../../documents";
import { SubmissionProof } from "../../domain/submission-proof.entity";
import { TenderSubmissionNotFoundError } from "../../domain/errors";
import type { SubmissionProofType } from "../../domain/submission-proof-type";
import { toTenderSubmissionSummary, type TenderSubmissionSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { SUBMISSION_PROOF_REPOSITORY, type SubmissionProofRepository } from "../ports/submission-proof.repository";
import { TENDER_SUBMISSION_REPOSITORY, type TenderSubmissionRepository } from "../ports/tender-submission.repository";
import { SubmissionAccessService } from "../services/submission-access.service";
import { verifyAttachableDocument } from "../services/verify-attachable-document";

export type AddSubmissionProofCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  submissionId: string;
  documentId: string;
  proofType: SubmissionProofType;
}>;

/** Mission §12 — plusieurs preuves possibles par soumission, jamais une preuve remplacée en
 *  place. Réutilise EXCLUSIVEMENT le stockage documentaire existant (mission §5). */
@Injectable()
export class AddSubmissionProofUseCase {
  constructor(
    private readonly accessService: SubmissionAccessService,
    private readonly getDocumentUseCase: GetDocumentUseCase,
    private readonly attachDocumentToTenderUseCase: AttachDocumentToTenderUseCase,
    @Inject(TENDER_SUBMISSION_REPOSITORY) private readonly submissionRepository: TenderSubmissionRepository,
    @Inject(SUBMISSION_PROOF_REPOSITORY) private readonly proofRepository: SubmissionProofRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: AddSubmissionProofCommand): Promise<TenderSubmissionSummary> {
    const submission = await this.submissionRepository.findById({ organizationId: command.organizationId, submissionId: command.submissionId });
    if (!submission) {
      throw new TenderSubmissionNotFoundError();
    }
    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: submission.tenderId, permission: ClientPermission.ManageSubmission });

    const verified = await verifyAttachableDocument(this.getDocumentUseCase, { organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, documentId: command.documentId });

    // Correctif audit Codex P1 — garantit STRUCTURELLEMENT (via le module Documents, jamais un
    // second mécanisme d'association) que le document utilisé comme preuve est rattaché au MÊME
    // Tender que la soumission, plutôt que de se contenter de vérifier l'accès de l'acteur au
    // document (ce qui n'empêchait pas une pièce d'un autre Tender du même organisme d'être
    // utilisée). Idempotent : une association déjà existante n'est jamais un échec.
    try {
      await this.attachDocumentToTenderUseCase.execute({ organizationId: command.organizationId, documentId: verified.documentId, tenderId: submission.tenderId, actorId: command.actorId, actorRole: command.actorRole });
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== "DUPLICATE_DOCUMENT_TENDER_ASSOCIATION") {
        throw error;
      }
    }

    const proof = SubmissionProof.create({
      id: this.idGenerator.generate(),
      submissionId: submission.id,
      organizationId: command.organizationId,
      documentId: verified.documentId,
      documentVersionId: verified.documentVersionId,
      proofType: command.proofType,
      hash: verified.documentChecksum,
      uploadedByUserId: command.actorId,
      occurredAt: this.clock.now(),
    });
    await this.proofRepository.create(proof);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "TENDER_SUBMISSION_PROOF_ADDED",
      resourceType: "TENDER_SUBMISSION",
      resourceId: submission.id,
      metadata: { proofId: proof.id, proofType: proof.proofType },
    });

    const proofs = await this.proofRepository.listBySubmission({ organizationId: command.organizationId, submissionId: submission.id });
    return toTenderSubmissionSummary(submission, proofs);
  }
}
