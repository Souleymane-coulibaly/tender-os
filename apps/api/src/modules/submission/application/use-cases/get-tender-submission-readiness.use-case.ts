import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { GetReadinessStatusUseCase, ReadinessStatus } from "../../../validation";
import { ListSubmissionPackagesUseCase, PackageStatus, type SubmissionPackageSummary } from "../../../submission-package";
import { isInFlightTenderSubmissionStatus, TenderSubmissionStatus } from "../../domain/tender-submission-status";
import { TENDER_SUBMISSION_REPOSITORY, type TenderSubmissionRepository } from "../ports/tender-submission.repository";
import { SubmissionAccessService } from "../services/submission-access.service";

export type GetTenderSubmissionReadinessQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

export const SubmissionReadinessStatus = {
  NotSubmitted: "NOT_SUBMITTED",
  ReadyForSubmission: "READY_FOR_SUBMISSION",
  SubmissionInProgress: "SUBMISSION_IN_PROGRESS",
  AlreadySubmitted: "ALREADY_SUBMITTED",
  Blocked: "BLOCKED",
} as const;
export type SubmissionReadinessStatus = (typeof SubmissionReadinessStatus)[keyof typeof SubmissionReadinessStatus];

export type TenderSubmissionReadinessResult = Readonly<{
  canSubmit: boolean;
  readinessStatus: SubmissionReadinessStatus;
  blockers: readonly string[];
  warnings: readonly string[];
  requiredActions: readonly string[];
  packageId?: string | undefined;
  packageVersion?: number | undefined;
  packageHash?: string | undefined;
  deadline?: string | undefined;
  remainingTimeMs?: number | undefined;
  signatureRequirement: string;
  validationSummary: string;
  activeSubmissionId?: string | undefined;
}>;

const SIGNATURE_GATING_STATUSES = new Set<string>([ReadinessStatus.ReadyForSignature, ReadinessStatus.SignatureInProgress, ReadinessStatus.PartiallySigned]);

function latestCompletedPackage(packages: readonly SubmissionPackageSummary[]): SubmissionPackageSummary | undefined {
  return packages.filter((p) => p.status === PackageStatus.Completed).sort((a, b) => b.version - a.version)[0];
}

/**
 * Sprint 9 — mission §8 : calcul de préparation au dépôt, EXCLUSIVEMENT backend. Composition PURE
 * de signaux déjà calculés par les modules existants (`validation` pour validation+signature,
 * `submission-package` pour le dernier package COMPLETED) + l'état propre de `submission`
 * (soumission active) — aucune règle de validation/signature n'est recalculée ici (mission §5 "ne
 * duplique jamais du code").
 */
@Injectable()
export class GetTenderSubmissionReadinessUseCase {
  constructor(
    private readonly accessService: SubmissionAccessService,
    private readonly getReadinessStatusUseCase: GetReadinessStatusUseCase,
    private readonly listSubmissionPackagesUseCase: ListSubmissionPackagesUseCase,
    @Inject(TENDER_SUBMISSION_REPOSITORY) private readonly submissionRepository: TenderSubmissionRepository,
  ) {}

  async execute(query: GetTenderSubmissionReadinessQuery): Promise<TenderSubmissionReadinessResult> {
    const tender = await this.accessService.assertTenderAccess({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId, permission: ClientPermission.ReadSubmission });

    const [validationResult, packages, activeSubmission] = await Promise.all([
      this.getReadinessStatusUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId }),
      this.listSubmissionPackagesUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId }),
      this.submissionRepository.findActiveForTender({ organizationId: query.organizationId, tenderId: query.tenderId }),
    ]);

    const blockers: string[] = [];
    const warnings: string[] = [];
    const requiredActions: string[] = [];

    const validationBlocking = validationResult.status === ReadinessStatus.NotReady || validationResult.status === ReadinessStatus.Blocked;
    if (validationBlocking) {
      blockers.push("Le dossier n'est pas prêt pour le dépôt.");
      requiredActions.push("Valider le dossier administratif.");
    }
    if (SIGNATURE_GATING_STATUSES.has(validationResult.status)) {
      blockers.push("Une ou plusieurs signatures requises ne sont pas terminées.");
      requiredActions.push("Signer les documents requis.");
    }

    const package_ = latestCompletedPackage(packages);
    if (!package_) {
      blockers.push("Le package final est introuvable.");
      requiredActions.push("Finaliser le package.");
    }

    const deadline = tender.submissionDeadline;
    const remainingTimeMs = deadline ? new Date(deadline).getTime() - Date.now() : undefined;
    const deadlinePassed = remainingTimeMs !== undefined && remainingTimeMs < 0;
    if (deadlinePassed) {
      blockers.push("La date limite de dépôt est dépassée.");
    }

    let readinessStatus: SubmissionReadinessStatus;
    if (activeSubmission && isInFlightTenderSubmissionStatus(activeSubmission.status)) {
      readinessStatus = activeSubmission.status === TenderSubmissionStatus.SubmissionInProgress ? SubmissionReadinessStatus.SubmissionInProgress : SubmissionReadinessStatus.AlreadySubmitted;
      requiredActions.push(activeSubmission.status === TenderSubmissionStatus.SubmissionInProgress ? "Enregistrer les informations du dépôt en cours." : "Confirmer l'accusé de réception ou remplacer le dépôt si nécessaire.");
    } else if (blockers.length > 0) {
      readinessStatus = SubmissionReadinessStatus.Blocked;
    } else if (!package_) {
      readinessStatus = SubmissionReadinessStatus.NotSubmitted;
    } else {
      readinessStatus = SubmissionReadinessStatus.ReadyForSubmission;
      requiredActions.push("Télécharger le package.", "Déposer sur la plateforme acheteur.", "Enregistrer la preuve du dépôt.");
    }

    const canSubmit = readinessStatus === SubmissionReadinessStatus.ReadyForSubmission;

    return {
      canSubmit,
      readinessStatus,
      blockers,
      warnings,
      requiredActions,
      packageId: package_?.id,
      packageVersion: package_?.version,
      packageHash: package_?.fileHash,
      deadline,
      remainingTimeMs,
      signatureRequirement: SIGNATURE_GATING_STATUSES.has(validationResult.status) ? validationResult.status : "SATISFIED_OR_NOT_REQUIRED",
      validationSummary: validationResult.status,
      activeSubmissionId: activeSubmission?.id,
    };
  }
}
