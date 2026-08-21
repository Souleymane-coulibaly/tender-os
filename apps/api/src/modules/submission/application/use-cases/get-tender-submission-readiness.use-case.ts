import { Inject, Injectable } from "@nestjs/common";
import { GetEffectiveTenderAnalysisSummaryUseCase, TenderBusinessAnalysisNotFoundError } from "../../../analysis";
import { GetChecklistFreshnessUseCase } from "../../../checklist-intelligence";
import { ClientPermission } from "../../../client-portfolio";
import { GetGoNoGoReportUseCase, GoNoGoReportNotFoundError } from "../../../opportunity";
import { GetRequiredResponsePackagesForTenderUseCase, GetResponsePackageFreshnessUseCase } from "../../../response-package";
import { GetTechnicalMemoFreshnessUseCase, ListTechnicalMemosUseCase } from "../../../technical-memo";
import { GetReadinessStatusUseCase, GetValidationFreshnessUseCase, ReadinessStatus } from "../../../validation";
import { ListSubmissionPackagesUseCase, PackageStatus, type SubmissionPackageSummary } from "../../../submission-package";
import { evaluateFileReadinessReasons, type FileReadinessInput } from "../../domain/evaluate-file-readiness";
import { SubmissionReadinessReasonSeverity, type SubmissionReadinessReason } from "../../domain/submission-readiness-reason";
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
  /** Checkpoint 2.1-P2.1-FIX-F — raisons structurées (mission §78-79), additives : `blockers`/
   *  `warnings` ci-dessus restent inchangés (contrat existant préservé, mission §119), ces raisons
   *  couvrent en PLUS les dimensions DCE/Analyse/Checklist/GO-NO-GO/Technical Memo/Validation
   *  fraîcheur/Response Package — jamais un second calcul divergent (voir
   *  `evaluateFileReadinessReasons`, pure, aucune E/S). */
  fileReadinessReasons: readonly SubmissionReadinessReason[];
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
    private readonly getEffectiveTenderAnalysisSummaryUseCase: GetEffectiveTenderAnalysisSummaryUseCase,
    private readonly getChecklistFreshnessUseCase: GetChecklistFreshnessUseCase,
    private readonly getGoNoGoReportUseCase: GetGoNoGoReportUseCase,
    private readonly listTechnicalMemosUseCase: ListTechnicalMemosUseCase,
    private readonly getTechnicalMemoFreshnessUseCase: GetTechnicalMemoFreshnessUseCase,
    private readonly getValidationFreshnessUseCase: GetValidationFreshnessUseCase,
    private readonly getRequiredResponsePackagesForTenderUseCase: GetRequiredResponsePackagesForTenderUseCase,
    private readonly getResponsePackageFreshnessUseCase: GetResponsePackageFreshnessUseCase,
  ) {}

  /**
   * Checkpoint 2.1-P2.1-FIX-F — résout le sous-état de CHAQUE dimension via son AUTORITÉ métier
   * existante (mission §1 "AGRÉGATEUR FINAL, jamais un nouveau moteur"), puis délègue la
   * classification à `evaluateFileReadinessReasons` (pure). Utilisée à l'IDENTIQUE par `GET
   * readiness` (ici) et par le guard `assertTenderSubmissionFileReady` (mission §94 "le guard doit
   * réutiliser le même calcul que GET readiness") — jamais un second calcul.
   */
  async resolveFileReadinessReasons(query: GetTenderSubmissionReadinessQuery, candidateCompanyId: string | undefined): Promise<readonly SubmissionReadinessReason[]> {
    const base = { organizationId: query.organizationId, tenderId: query.tenderId, actorId: query.actorId, actorRole: query.actorRole };

    const [analysisResult, checklistResult, goNoGoResult, technicalMemos, validationResult, responsePackageRequirements] = await Promise.all([
      this.getEffectiveTenderAnalysisSummaryUseCase.execute(base).catch((error) => {
        if (error instanceof TenderBusinessAnalysisNotFoundError) return undefined;
        throw error;
      }),
      this.getChecklistFreshnessUseCase.execute(base),
      this.getGoNoGoReportUseCase.execute(base).catch((error) => {
        if (error instanceof GoNoGoReportNotFoundError) return undefined;
        throw error;
      }),
      this.listTechnicalMemosUseCase.execute(base),
      this.getValidationFreshnessUseCase.execute(base),
      this.getRequiredResponsePackagesForTenderUseCase.execute(base),
    ]);

    // Mission "le PIRE signal parmi tous les mémoires du tender s'il y en a plusieurs" — même
    // granularité tender-wide que le reste de ce use case (jamais un scope Lot inventé ici, mission
    // §111-112 "prouver l'architecture existante" — Technical Memo n'a pas de notion de lot).
    const technicalMemoFreshnesses = await Promise.all(
      technicalMemos.map((memo) => this.getTechnicalMemoFreshnessUseCase.execute({ organizationId: query.organizationId, technicalMemoId: memo.id, actorId: query.actorId, actorRole: query.actorRole })),
    );
    const worstTechnicalMemoFreshness = technicalMemoFreshnesses.length === 0 ? undefined : technicalMemoFreshnesses.some((f) => f.freshness === "STALE") ? "STALE" : technicalMemoFreshnesses.some((f) => f.freshness === "UNKNOWN") ? "UNKNOWN" : "CURRENT";

    // Checkpoint TENDEROS-2.1-P2.2-F2.3, mission §15/§27/§28 — READY signifie que TOUS les créneaux
    // REQUIS (global unique, ou un par lot RÉELLEMENT sélectionné pour candidature — jamais "au
    // moins un ResponsePackage créé quelque part est CURRENT", l'ancien calcul non scopé). Un
    // créneau requis dont `matchingPackages.length !== 1` (absent, ou ambigu — jamais deviné, même
    // discipline que le resolver F2) compte comme non résolu ; un lot NON sélectionné n'apparaît
    // jamais dans `responsePackageRequirements` (mission §14/§16) donc ne peut jamais peser ici.
    let anyRequirementUnresolved = false;
    const resolvedRequirementFreshnesses: Array<{ freshness: "CURRENT" | "STALE" | "UNKNOWN"; hasCurrentVersion: boolean; isValidated: boolean }> = [];
    for (const requirement of responsePackageRequirements) {
      if (requirement.matchingPackages.length !== 1) {
        anyRequirementUnresolved = true;
        continue;
      }
      const pkg = requirement.matchingPackages[0]!;
      const freshness = await this.getResponsePackageFreshnessUseCase.execute({ organizationId: query.organizationId, responsePackageId: pkg.id, actorId: query.actorId, actorRole: query.actorRole });
      resolvedRequirementFreshnesses.push({ freshness: freshness.freshness, hasCurrentVersion: pkg.currentVersionId !== undefined, isValidated: pkg.status === "VALIDATED" || pkg.status === "EXPORTED" });
    }
    const worstResponsePackageFreshness =
      resolvedRequirementFreshnesses.length === 0
        ? undefined
        : resolvedRequirementFreshnesses.some((f) => f.freshness === "STALE")
          ? "STALE"
          : resolvedRequirementFreshnesses.some((f) => f.freshness === "UNKNOWN")
            ? "UNKNOWN"
            : "CURRENT";
    const anyCurrentVersionNotValidated = resolvedRequirementFreshnesses.some((f) => f.hasCurrentVersion && !f.isValidated);

    const input: FileReadinessInput = {
      candidateCompanyId,
      analysis: { exists: analysisResult !== undefined, freshness: analysisResult?.analysisFreshness },
      checklist: { freshness: checklistResult.checklistFreshness },
      goNoGo: { exists: goNoGoResult !== undefined, freshness: goNoGoResult?.freshness, recommendation: goNoGoResult?.recommendation },
      technicalMemo: { exists: technicalMemos.length > 0, freshness: worstTechnicalMemoFreshness },
      validation: { hasActiveApproval: validationResult.hasActiveApproval, freshness: validationResult.freshness },
      responsePackage: {
        exists: !anyRequirementUnresolved && resolvedRequirementFreshnesses.length > 0,
        freshness: worstResponsePackageFreshness,
        isCurrentVersionValidated: resolvedRequirementFreshnesses.length === 0 ? undefined : !anyCurrentVersionNotValidated,
      },
    };

    return evaluateFileReadinessReasons(input);
  }

  async execute(query: GetTenderSubmissionReadinessQuery): Promise<TenderSubmissionReadinessResult> {
    const tender = await this.accessService.assertTenderAccess({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId, permission: ClientPermission.ReadSubmission });

    const [validationResult, packages, activeSubmission, fileReadinessReasons] = await Promise.all([
      this.getReadinessStatusUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId }),
      this.listSubmissionPackagesUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId }),
      this.submissionRepository.findActiveForTender({ organizationId: query.organizationId, tenderId: query.tenderId }),
      this.resolveFileReadinessReasons(query, tender.candidateCompanyId),
    ]);

    const blockers: string[] = [];
    const warnings: string[] = [];
    const requiredActions: string[] = [];

    // Checkpoint 2.1-P2.1-FIX-F — les raisons BLOCKING du dossier (DCE/Analyse/Checklist/GO-NO-GO/
    // Technical Memo/Validation-fraîcheur/Response Package) alimentent le MÊME calcul de
    // `readinessStatus` que les blockers historiques ci-dessous — jamais une seconde vérité
    // parallèle qui pourrait diverger (mission §8 "ne pas laisser deux moteurs contradictoires").
    for (const reason of fileReadinessReasons) {
      if (reason.severity === SubmissionReadinessReasonSeverity.Blocking) blockers.push(reason.message);
      else if (reason.severity === SubmissionReadinessReasonSeverity.Warning) warnings.push(reason.message);
    }

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
      fileReadinessReasons,
    };
  }
}
