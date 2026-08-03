import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import {
  isTerminalSignatureTransactionStatus,
  SIGNATURE_REQUIREMENT_REPOSITORY,
  SIGNATURE_TRANSACTION_REPOSITORY,
  SignatureTransactionStatus,
  type SignatureRequirementRepository,
  type SignatureTransactionRepository,
} from "../../../signature";
import { GetTenderUseCase } from "../../../tenders";
import { ReadinessStatus } from "../../domain/readiness-status";
import { FINAL_APPROVAL_REPOSITORY, type FinalApprovalRepository } from "../ports/final-approval.repository";
import { VALIDATION_RUN_REPOSITORY, type ValidationRunRepository } from "../ports/validation-run.repository";

export type GetReadinessStatusQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;
export type ReadinessStatusResult = Readonly<{ status: string; latestValidationRunId?: string | undefined; activeApprovalId?: string | undefined }>;

const SIGNED_OR_BEYOND = new Set<string>([SignatureTransactionStatus.Signed, SignatureTransactionStatus.Verified]);
const FAILURE_STATUSES = new Set<string>([
  SignatureTransactionStatus.Declined,
  SignatureTransactionStatus.Cancelled,
  SignatureTransactionStatus.Expired,
  SignatureTransactionStatus.Failed,
  SignatureTransactionStatus.Invalid,
]);

/**
 * Mission Sprint 8A.2 (correction bug #5 — "reste bloqué sur 'en attente d'approbation' après
 * signature") — une fois une `FinalApproval` ACTIVE trouvée, réconcilie l'état RÉEL de la
 * signature plutôt que de renvoyer APPROVED indéfiniment. Même seuil EXACT que
 * `CreateSubmissionPackageUseCase` (submission-package) pour READY_FOR_SUBMISSION — un Tender
 * signalé "prêt pour soumission" ici doit toujours pouvoir constituer un package avec succès,
 * jamais deux calculs divergents du même fait.
 */
function deriveApprovedReadiness(input: {
  requirements: readonly { mandatory: boolean; status: string }[];
  transactions: readonly { transaction: { status: string } }[];
}): typeof ReadinessStatus.Approved | typeof ReadinessStatus.ReadyForSignature | typeof ReadinessStatus.SignatureInProgress | typeof ReadinessStatus.PartiallySigned | typeof ReadinessStatus.ReadyForSubmission | typeof ReadinessStatus.Blocked {
  const mandatoryConfirmed = input.requirements.filter((r) => r.mandatory && r.status === "CONFIRMED");
  if (mandatoryConfirmed.length === 0) {
    // Aucune exigence de signature confirmée pour ce dossier — la signature n'est simplement pas
    // requise, jamais un blocage inventé (même motif que CreateSubmissionPackageUseCase).
    return ReadinessStatus.Approved;
  }

  if (input.transactions.length === 0) {
    return ReadinessStatus.ReadyForSignature;
  }

  const statuses = input.transactions.map((t) => t.transaction.status);
  const verified = statuses.filter((s) => s === SignatureTransactionStatus.Verified);
  const nonTerminal = statuses.filter((s) => !isTerminalSignatureTransactionStatus(s as SignatureTransactionStatus));

  if (verified.length > 0 && nonTerminal.length === 0) {
    return ReadinessStatus.ReadyForSubmission;
  }
  if (statuses.every((s) => FAILURE_STATUSES.has(s))) {
    return ReadinessStatus.Blocked;
  }
  return statuses.some((s) => SIGNED_OR_BEYOND.has(s)) ? ReadinessStatus.PartiallySigned : ReadinessStatus.SignatureInProgress;
}

@Injectable()
export class GetReadinessStatusUseCase {
  constructor(
    @Inject(VALIDATION_RUN_REPOSITORY) private readonly validationRunRepository: ValidationRunRepository,
    @Inject(FINAL_APPROVAL_REPOSITORY) private readonly finalApprovalRepository: FinalApprovalRepository,
    @Inject(SIGNATURE_REQUIREMENT_REPOSITORY) private readonly signatureRequirementRepository: SignatureRequirementRepository,
    @Inject(SIGNATURE_TRANSACTION_REPOSITORY) private readonly signatureTransactionRepository: SignatureTransactionRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetReadinessStatusQuery): Promise<ReadinessStatusResult> {
    const tender = await this.getTenderUseCase.execute({ organizationId: query.organizationId, tenderId: query.tenderId, actorId: query.actorId, actorRole: query.actorRole });
    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadExport,
    });

    const activeApproval = await this.finalApprovalRepository.findActiveForTender({ organizationId: query.organizationId, tenderId: query.tenderId });
    if (activeApproval) {
      const [requirements, transactions] = await Promise.all([
        this.signatureRequirementRepository.listForTender({ organizationId: query.organizationId, tenderId: query.tenderId }),
        this.signatureTransactionRepository.listForTender({ organizationId: query.organizationId, tenderId: query.tenderId }),
      ]);
      const status = deriveApprovedReadiness({ requirements, transactions });
      return { status, activeApprovalId: activeApproval.id };
    }

    const latest = (await this.validationRunRepository.list({ organizationId: query.organizationId, tenderId: query.tenderId, limit: 1, offset: 0 })).items[0];
    if (!latest) {
      return { status: ReadinessStatus.NotReady };
    }

    return { status: latest.readinessStatus, latestValidationRunId: latest.id };
  }
}
