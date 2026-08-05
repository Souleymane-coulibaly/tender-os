import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { TenderSubmissionStatus } from "../../domain/tender-submission-status";
import { TENDER_SUBMISSION_REPOSITORY, type TenderSubmissionRepository } from "../ports/tender-submission.repository";
import { SubmissionAccessService } from "../services/submission-access.service";
import { GetTenderSubmissionReadinessUseCase, SubmissionReadinessStatus, type TenderSubmissionReadinessResult } from "./get-tender-submission-readiness.use-case";

export type GetTenderSubmissionCapabilitiesQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

export type TenderSubmissionCapabilities = Readonly<{
  canViewSubmission: boolean;
  canPrepareSubmission: boolean;
  canRecordSubmission: boolean;
  canUploadProof: boolean;
  canConfirmReceipt: boolean;
  canReplaceSubmission: boolean;
  canWithdrawSubmission: boolean;
  canCancelSubmission: boolean;
  canRecordRejection: boolean;
  activeSubmissionId?: string | undefined;
  readiness: TenderSubmissionReadinessResult;
  blockers: readonly string[];
  warnings: readonly string[];
  availableActions: readonly string[];
  reasonsByAction: Readonly<Record<string, string>>;
}>;

const NO_PERMISSION_REASON = "Vous n'avez pas l'autorisation nécessaire pour cette action.";

/**
 * Sprint 9 — mission §19 : les capabilities sont calculées EXCLUSIVEMENT côté backend (mission §19/
 * §20/§22 "le frontend ne choisit pas directement n'importe quel statut"), en réutilisant
 * `GetTenderSubmissionReadinessUseCase` (jamais un second calcul divergent) et le probe
 * try/catch déjà pratiqué par `GetAdministrativeDossierCapabilitiesUseCase` pour sonder les
 * permissions sans dupliquer la policy `AssertClientAccessUseCase`.
 */
@Injectable()
export class GetTenderSubmissionCapabilitiesUseCase {
  constructor(
    private readonly accessService: SubmissionAccessService,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly getReadinessUseCase: GetTenderSubmissionReadinessUseCase,
    @Inject(TENDER_SUBMISSION_REPOSITORY) private readonly submissionRepository: TenderSubmissionRepository,
  ) {}

  async execute(query: GetTenderSubmissionCapabilitiesQuery): Promise<TenderSubmissionCapabilities> {
    const tender = await this.accessService.assertTenderAccess({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId, permission: ClientPermission.ReadSubmission });

    const [canManage, canConfirm, canWithdraw, readiness, activeSubmission] = await Promise.all([
      this.hasPermission({ organizationId: query.organizationId, clientAccountId: tender.clientAccountId, actorId: query.actorId, actorRole: query.actorRole, permission: ClientPermission.ManageSubmission }),
      this.hasPermission({ organizationId: query.organizationId, clientAccountId: tender.clientAccountId, actorId: query.actorId, actorRole: query.actorRole, permission: ClientPermission.ConfirmSubmission }),
      this.hasPermission({ organizationId: query.organizationId, clientAccountId: tender.clientAccountId, actorId: query.actorId, actorRole: query.actorRole, permission: ClientPermission.WithdrawSubmission }),
      this.getReadinessUseCase.execute(query),
      this.submissionRepository.findActiveForTender({ organizationId: query.organizationId, tenderId: query.tenderId }),
    ]);

    const deadlinePassed = readiness.remainingTimeMs !== undefined && readiness.remainingTimeMs < 0;
    const activeStatus = activeSubmission?.status;

    const canPrepareSubmission = canManage && (readiness.readinessStatus === SubmissionReadinessStatus.NotSubmitted || readiness.readinessStatus === SubmissionReadinessStatus.ReadyForSubmission);
    const canRecordSubmission = canManage && (readiness.readinessStatus === SubmissionReadinessStatus.ReadyForSubmission || activeStatus === TenderSubmissionStatus.SubmissionInProgress);
    const canUploadProof = canManage && (activeStatus === TenderSubmissionStatus.Submitted || activeStatus === TenderSubmissionStatus.ReceiptConfirmed);
    const canConfirmReceipt = canConfirm && activeStatus === TenderSubmissionStatus.Submitted;
    const canReplaceSubmission = canManage && !deadlinePassed && (activeStatus === TenderSubmissionStatus.Submitted || activeStatus === TenderSubmissionStatus.ReceiptConfirmed);
    const canWithdrawSubmission = canWithdraw && (activeStatus === TenderSubmissionStatus.Submitted || activeStatus === TenderSubmissionStatus.ReceiptConfirmed);
    const canCancelSubmission = canManage && activeStatus === TenderSubmissionStatus.SubmissionInProgress;
    const canRecordRejection = canManage && activeStatus === TenderSubmissionStatus.Submitted;

    const reasonsByAction: Record<string, string> = {};
    if (!canPrepareSubmission) reasonsByAction.canPrepareSubmission = !canManage ? NO_PERMISSION_REASON : "Une soumission est déjà en cours pour ce marché.";
    if (!canRecordSubmission) reasonsByAction.canRecordSubmission = !canManage ? NO_PERMISSION_REASON : "Le dossier n'est pas prêt pour le dépôt.";
    if (!canUploadProof) reasonsByAction.canUploadProof = !canManage ? NO_PERMISSION_REASON : "Aucun dépôt actif n'est enregistré.";
    if (!canConfirmReceipt) reasonsByAction.canConfirmReceipt = !canConfirm ? NO_PERMISSION_REASON : "Ce dépôt n'attend pas de confirmation de reçu.";
    if (!canReplaceSubmission) reasonsByAction.canReplaceSubmission = !canManage ? NO_PERMISSION_REASON : deadlinePassed ? "La date limite de dépôt est dépassée." : "Aucun dépôt actif à remplacer.";
    if (!canWithdrawSubmission) reasonsByAction.canWithdrawSubmission = !canWithdraw ? NO_PERMISSION_REASON : "Aucun dépôt actif à retirer.";
    if (!canCancelSubmission) reasonsByAction.canCancelSubmission = !canManage ? NO_PERMISSION_REASON : "Aucun dépôt en cours à annuler.";
    if (!canRecordRejection) reasonsByAction.canRecordRejection = !canManage ? NO_PERMISSION_REASON : "Ce dépôt n'est pas dans un état pouvant être rejeté.";

    const availableActions = Object.entries({
      RECORD_SUBMISSION: canRecordSubmission,
      UPLOAD_PROOF: canUploadProof,
      CONFIRM_RECEIPT: canConfirmReceipt,
      REPLACE_SUBMISSION: canReplaceSubmission,
      WITHDRAW_SUBMISSION: canWithdrawSubmission,
      CANCEL_SUBMISSION: canCancelSubmission,
      RECORD_REJECTION: canRecordRejection,
    })
      .filter(([, enabled]) => enabled)
      .map(([action]) => action);

    return {
      canViewSubmission: true,
      canPrepareSubmission,
      canRecordSubmission,
      canUploadProof,
      canConfirmReceipt,
      canReplaceSubmission,
      canWithdrawSubmission,
      canCancelSubmission,
      canRecordRejection,
      activeSubmissionId: activeSubmission?.id,
      readiness,
      blockers: readiness.blockers,
      warnings: readiness.warnings,
      availableActions,
      reasonsByAction,
    };
  }

  private async hasPermission(input: { organizationId: string; clientAccountId: string; actorId: string; actorRole: string; permission: ClientPermission }): Promise<boolean> {
    try {
      await this.assertClientAccessUseCase.execute(input);
      return true;
    } catch {
      return false;
    }
  }
}
