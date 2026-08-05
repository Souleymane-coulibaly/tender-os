import { Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetDceUseCase, ListDceDocumentsUseCase, DceNotFoundError } from "../../../dce";
import { ListTenderDocumentsUseCase } from "../../../documents";
import { GetTenderBusinessAnalysisUseCase } from "../../../analysis";
import { TenderBusinessAnalysisNotFoundError } from "../../../analysis";
import { GetTenderCostSummaryUseCase } from "../../../pricing";
import { ListDeliverablesUseCase, DeliverableStatus } from "../../../deliverables";
import { ListExportHistoryUseCase, ExportStatus } from "../../../export";
import { GetReadinessStatusUseCase, ReadinessStatus } from "../../../validation";
import { ListSignatureRequirementsUseCase } from "../../../signature";
import { ListTenderSubmissionsUseCase, TenderSubmissionStatus } from "../../../submission";
import { ListSubmissionPackagesUseCase } from "../../../submission-package";
import { GetTenderUseCase } from "../../../tenders";
import {
  CockpitAlertLevel,
  CockpitModuleKey,
  CockpitModuleStatus,
  CockpitNextAction,
  CockpitStep,
  type CockpitAlert,
  type CockpitModuleSummary,
  type TenderCockpitResult,
} from "../dtos";

export type GetTenderCockpitQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string }>;

const DELIVERABLE_DONE_STATUSES = new Set<string>([DeliverableStatus.Validated, DeliverableStatus.Approved, DeliverableStatus.Exported]);

const READINESS_BEFORE_APPROVAL = new Set<string>([ReadinessStatus.NotReady, ReadinessStatus.ReadyWithWarnings, ReadinessStatus.ReadyForApproval]);
const READINESS_SIGNATURE_STAGE = new Set<string>([ReadinessStatus.ReadyForSignature, ReadinessStatus.SignatureInProgress, ReadinessStatus.PartiallySigned, ReadinessStatus.Blocked]);

/**
 * Mission Sprint 8A.2 — Cockpit Bid Manager : synthèse backend-driven de l'état d'un Tender
 * ("étape courante", statut par module, blocages/avertissements/informations, prochaine action).
 * Vit dans un module dédié EN AVAL de Documents/DCE/Analysis/Pricing/Deliverables/Signature/
 * Export/Validation/Submission-Package (aucun d'eux ne l'importe jamais en retour — les 9 modules
 * dépendent tous de `tenders`, qui ne peut donc pas dépendre d'eux sans cycle Nest, décision
 * explicitement validée avec l'utilisateur). Chaque signal provient de l'API PUBLIQUE déjà exposée
 * par son module d'origine, JAMAIS d'un second accès direct à ses tables ni d'une seconde
 * dérivation d'une règle métier déjà calculée ailleurs — en particulier, le statut Signature ne
 * recalcule RIEN : il lit directement `ReadinessStatus` déjà réconcilié par
 * `GetReadinessStatusUseCase` (Validation, correction bug #5).
 */
@Injectable()
export class GetTenderCockpitUseCase {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly getDceUseCase: GetDceUseCase,
    private readonly listDceDocumentsUseCase: ListDceDocumentsUseCase,
    private readonly listTenderDocumentsUseCase: ListTenderDocumentsUseCase,
    private readonly getTenderBusinessAnalysisUseCase: GetTenderBusinessAnalysisUseCase,
    private readonly getTenderCostSummaryUseCase: GetTenderCostSummaryUseCase,
    private readonly listDeliverablesUseCase: ListDeliverablesUseCase,
    private readonly listExportHistoryUseCase: ListExportHistoryUseCase,
    private readonly getReadinessStatusUseCase: GetReadinessStatusUseCase,
    private readonly listSignatureRequirementsUseCase: ListSignatureRequirementsUseCase,
    private readonly listSubmissionPackagesUseCase: ListSubmissionPackagesUseCase,
    private readonly listTenderSubmissionsUseCase: ListTenderSubmissionsUseCase,
  ) {}

  async execute(query: GetTenderCockpitQuery): Promise<TenderCockpitResult> {
    const tender = await this.getTenderUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
    });
    // Porte d'entrée unique — chaque sous-appel ci-dessous applique ENSUITE sa propre permission
    // spécifique (ReadDocuments/ReadAnalysis/ReadPricing/ReadDeliverable/ReadExport...), jamais
    // contournée : cette vérification ne fait que garantir que l'acteur peut au moins consulter ce
    // Tender avant de composer sa vue d'ensemble.
    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadTender,
    });

    const baseQuery = { organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, tenderId: query.tenderId };

    const [dceModule, documents, analysisModule, pricingModule, deliverables, exportHistory, readiness, signatureRequirements, packages, submissions] = await Promise.all([
      this.resolveDceModule(baseQuery),
      this.listTenderDocumentsUseCase.execute(baseQuery),
      this.resolveAnalysisModule(baseQuery),
      this.resolvePricingModule(baseQuery),
      this.listDeliverablesUseCase.execute(baseQuery),
      this.listExportHistoryUseCase.execute({ ...baseQuery, mode: undefined, limit: 1, offset: 0 }),
      this.getReadinessStatusUseCase.execute(baseQuery),
      this.listSignatureRequirementsUseCase.execute(baseQuery),
      this.listSubmissionPackagesUseCase.execute(baseQuery),
      this.listTenderSubmissionsUseCase.execute(baseQuery),
    ]);
    // Le DERNIER dépôt (pas seulement celui "en vol") — un REJECTED/WITHDRAWN n'est plus "actif"
    // au sens de `findActiveForTender` mais reste ce que le cockpit doit afficher comme "dernier
    // dépôt" (mission §26 "dernier dépôt").
    const latestSubmission = submissions[submissions.length - 1];

    const deliverablesDone = deliverables.filter((d) => DELIVERABLE_DONE_STATUSES.has(d.status)).length;
    const deliverablesBlocked = deliverables.some((d) => d.status === DeliverableStatus.Blocked);
    const deliverablesModule: CockpitModuleSummary = {
      key: CockpitModuleKey.Deliverables,
      status: deliverablesBlocked
        ? CockpitModuleStatus.Attention
        : deliverablesDone === deliverables.length && deliverables.length > 0
          ? CockpitModuleStatus.Done
          : deliverablesDone > 0
            ? CockpitModuleStatus.InProgress
            : CockpitModuleStatus.NotStarted,
      count: deliverablesDone,
      total: deliverables.length,
    };

    const anyCompletedExport = exportHistory.items.some((job) => job.status === ExportStatus.Completed) || exportHistory.total > 0;
    const exportModule: CockpitModuleSummary = {
      key: CockpitModuleKey.Export,
      status: anyCompletedExport ? CockpitModuleStatus.Done : CockpitModuleStatus.NotStarted,
    };

    const validationModule: CockpitModuleSummary = {
      key: CockpitModuleKey.Validation,
      status:
        readiness.status === ReadinessStatus.NotReady
          ? CockpitModuleStatus.NotStarted
          : readiness.status === ReadinessStatus.Blocked
            ? CockpitModuleStatus.Attention
            : readiness.status === ReadinessStatus.ReadyWithWarnings
              ? CockpitModuleStatus.Attention
              : readiness.status === ReadinessStatus.ReadyForApproval
                ? CockpitModuleStatus.InProgress
                : CockpitModuleStatus.Done,
    };

    const mandatoryRequirements = signatureRequirements.filter((r) => r.mandatory);
    const signatureModule = this.resolveSignatureModule({ readinessStatus: readiness.status, hasMandatoryRequirement: mandatoryRequirements.length > 0 });

    const packageModule: CockpitModuleSummary = {
      key: CockpitModuleKey.Package,
      status:
        packages.length > 0
          ? CockpitModuleStatus.Done
          : readiness.status === ReadinessStatus.ReadyForSubmission || (readiness.status === ReadinessStatus.Approved && mandatoryRequirements.length === 0)
            ? CockpitModuleStatus.InProgress
            : CockpitModuleStatus.NotStarted,
    };

    const documentsModule: CockpitModuleSummary = {
      key: CockpitModuleKey.Dce,
      status: dceModule.exists ? (dceModule.documentCount > 0 ? CockpitModuleStatus.Done : CockpitModuleStatus.InProgress) : CockpitModuleStatus.NotStarted,
      count: dceModule.documentCount + documents.length,
    };

    const submissionModule = this.resolveSubmissionModule({ hasPackage: packages.length > 0, latestSubmissionStatus: latestSubmission?.status });

    const modules: CockpitModuleSummary[] = [
      documentsModule,
      analysisModule,
      pricingModule,
      deliverablesModule,
      exportModule,
      validationModule,
      signatureModule,
      packageModule,
      submissionModule,
    ];

    const currentStep = this.resolveCurrentStep({
      hasPackage: packages.length > 0,
      readinessStatus: readiness.status,
      hasActiveApproval: readiness.activeApprovalId !== undefined,
      hasValidationRun: readiness.latestValidationRunId !== undefined,
      // `DONE`, jamais seulement "démarré" — un DCE initialisé sans le moindre document doit
      // encore rester à l'étape DISCOVERY (mission "prochaine action" cohérente avec l'étape
      // affichée : `resolveNextAction` propose IMPORT_DOCUMENTS pour ce cas précis).
      dceDone: documentsModule.status === CockpitModuleStatus.Done,
      analysisStarted: analysisModule.status !== CockpitModuleStatus.NotStarted,
      // Sprint 9 — l'étape SUBMISSION n'est DONE qu'une fois le reçu confirmé, jamais à la simple
      // existence d'un package (mission §9/§26).
      submissionReceiptConfirmed: latestSubmission?.status === TenderSubmissionStatus.ReceiptConfirmed,
    });

    const nextAction = this.resolveNextAction({
      currentStep,
      dceModule: documentsModule,
      deliverablesModule,
      pricingModule,
      exportModule,
      readinessStatus: readiness.status,
      signatureModule,
      hasPackage: packages.length > 0,
      latestSubmissionStatus: latestSubmission?.status,
    });

    const alerts = this.buildAlerts({ dceModule: documentsModule, deliverablesBlocked, readinessStatus: readiness.status, latestSubmissionStatus: latestSubmission?.status });

    return { tenderId: query.tenderId, currentStep, nextAction, modules, alerts };
  }

  private async resolveDceModule(query: { organizationId: string; actorId: string; actorRole: string; tenderId: string }): Promise<{ exists: boolean; documentCount: number }> {
    try {
      await this.getDceUseCase.execute(query);
    } catch (error) {
      if (error instanceof DceNotFoundError) return { exists: false, documentCount: 0 };
      throw error;
    }
    const documents = await this.listDceDocumentsUseCase.execute(query);
    return { exists: true, documentCount: documents.length };
  }

  private async resolveAnalysisModule(query: { organizationId: string; actorId: string; actorRole: string; tenderId: string }): Promise<CockpitModuleSummary> {
    try {
      await this.getTenderBusinessAnalysisUseCase.execute(query);
      return { key: CockpitModuleKey.Analysis, status: CockpitModuleStatus.Done };
    } catch (error) {
      if (error instanceof TenderBusinessAnalysisNotFoundError) return { key: CockpitModuleKey.Analysis, status: CockpitModuleStatus.NotStarted };
      throw error;
    }
  }

  private async resolvePricingModule(query: { organizationId: string; actorId: string; actorRole: string; tenderId: string }): Promise<CockpitModuleSummary> {
    const summary = await this.getTenderCostSummaryUseCase.execute(query);
    return { key: CockpitModuleKey.Pricing, status: summary.activeEstimate ? CockpitModuleStatus.Done : CockpitModuleStatus.NotStarted };
  }

  /** Aucune règle recalculée — dérive UNIQUEMENT de `ReadinessStatus`, déjà réconcilié par
   *  Validation (mission Sprint 8A.2 correction bug #5) à partir de l'état réel des
   *  `SignatureTransaction`. */
  private resolveSignatureModule(input: { readinessStatus: string; hasMandatoryRequirement: boolean }): CockpitModuleSummary {
    if (!input.hasMandatoryRequirement) {
      return { key: CockpitModuleKey.Signature, status: CockpitModuleStatus.NotApplicable };
    }
    if (READINESS_BEFORE_APPROVAL.has(input.readinessStatus)) {
      return { key: CockpitModuleKey.Signature, status: CockpitModuleStatus.NotStarted };
    }
    if (input.readinessStatus === ReadinessStatus.Blocked) {
      return { key: CockpitModuleKey.Signature, status: CockpitModuleStatus.Attention };
    }
    if (input.readinessStatus === ReadinessStatus.ReadyForSubmission) {
      return { key: CockpitModuleKey.Signature, status: CockpitModuleStatus.Done };
    }
    if (READINESS_SIGNATURE_STAGE.has(input.readinessStatus)) {
      return { key: CockpitModuleKey.Signature, status: CockpitModuleStatus.InProgress };
    }
    // ReadinessStatus.Approved avec une exigence mandatory détectée mais jamais confirmée — la
    // signature n'a jamais pu démarrer, reste NOT_STARTED plutôt qu'un état inventé.
    return { key: CockpitModuleKey.Signature, status: CockpitModuleStatus.NotStarted };
  }

  /** Sprint 9 — aucune règle recalculée : dérive UNIQUEMENT du statut RÉEL de la DERNIÈRE
   *  `TenderSubmission` (déjà calculé par `submission`), jamais une seconde dérivation. */
  private resolveSubmissionModule(input: { hasPackage: boolean; latestSubmissionStatus?: string | undefined }): CockpitModuleSummary {
    if (!input.hasPackage) {
      return { key: CockpitModuleKey.Submission, status: CockpitModuleStatus.NotStarted };
    }
    switch (input.latestSubmissionStatus) {
      case TenderSubmissionStatus.ReceiptConfirmed:
        return { key: CockpitModuleKey.Submission, status: CockpitModuleStatus.Done };
      case TenderSubmissionStatus.SubmissionRejected:
        return { key: CockpitModuleKey.Submission, status: CockpitModuleStatus.Attention };
      case TenderSubmissionStatus.Submitted:
      case TenderSubmissionStatus.SubmissionInProgress:
        return { key: CockpitModuleKey.Submission, status: CockpitModuleStatus.InProgress };
      default:
        return { key: CockpitModuleKey.Submission, status: CockpitModuleStatus.NotStarted };
    }
  }

  private resolveCurrentStep(input: {
    hasPackage: boolean;
    readinessStatus: string;
    hasActiveApproval: boolean;
    hasValidationRun: boolean;
    dceDone: boolean;
    analysisStarted: boolean;
    submissionReceiptConfirmed: boolean;
  }): CockpitStep {
    // Sprint 9 — `DONE` uniquement une fois le reçu confirmé, jamais à la simple existence d'un
    // package (mission §9 "préparer le suivi APRÈS dépôt").
    if (input.submissionReceiptConfirmed) return CockpitStep.Done;
    if (input.hasPackage) return CockpitStep.Submission;
    if (input.hasActiveApproval) {
      if (input.readinessStatus === ReadinessStatus.ReadyForSubmission || input.readinessStatus === ReadinessStatus.Approved) return CockpitStep.Submission;
      return CockpitStep.Signature;
    }
    if (input.hasValidationRun) return CockpitStep.Validation;
    if (!input.dceDone) return CockpitStep.Discovery;
    if (!input.analysisStarted) return CockpitStep.Analysis;
    return CockpitStep.Preparation;
  }

  private resolveNextAction(input: {
    currentStep: CockpitStep;
    dceModule: CockpitModuleSummary;
    deliverablesModule: CockpitModuleSummary;
    pricingModule: CockpitModuleSummary;
    exportModule: CockpitModuleSummary;
    readinessStatus: string;
    signatureModule: CockpitModuleSummary;
    hasPackage: boolean;
    latestSubmissionStatus?: string | undefined;
  }): CockpitNextAction {
    switch (input.currentStep) {
      case CockpitStep.Discovery:
        return input.dceModule.status === CockpitModuleStatus.NotStarted ? CockpitNextAction.InitializeDce : CockpitNextAction.ImportDocuments;
      case CockpitStep.Analysis:
        return CockpitNextAction.RunAnalysis;
      case CockpitStep.Preparation:
        if (input.deliverablesModule.status !== CockpitModuleStatus.Done) return CockpitNextAction.CompleteDeliverables;
        if (input.pricingModule.status === CockpitModuleStatus.NotStarted) return CockpitNextAction.CreatePricingEstimate;
        if (input.exportModule.status === CockpitModuleStatus.NotStarted) return CockpitNextAction.PreviewExport;
        return CockpitNextAction.RunValidation;
      case CockpitStep.Validation:
        return input.readinessStatus === ReadinessStatus.Blocked ? CockpitNextAction.ResolveBlockingIssues : CockpitNextAction.ApproveFinalVersion;
      case CockpitStep.Signature:
        return input.signatureModule.status === CockpitModuleStatus.NotStarted ? CockpitNextAction.StartSignature : CockpitNextAction.FollowSignature;
      case CockpitStep.Submission:
        // Sprint 9 — mission §26 : "Télécharger le package" / "Déposer" / "Enregistrer la preuve" /
        // "Corriger le rejet" / "Confirmer l'accusé de réception", jamais une réponse IA libre.
        if (!input.hasPackage) return CockpitNextAction.CreatePackage;
        if (input.latestSubmissionStatus === TenderSubmissionStatus.SubmissionRejected) return CockpitNextAction.FixTechnicalRejection;
        if (input.latestSubmissionStatus === TenderSubmissionStatus.Submitted) return CockpitNextAction.ConfirmReceipt;
        if (input.latestSubmissionStatus === TenderSubmissionStatus.SubmissionInProgress) return CockpitNextAction.SubmitPackage;
        return CockpitNextAction.DownloadPackage;
      case CockpitStep.Done:
        return CockpitNextAction.None;
      default:
        return CockpitNextAction.None;
    }
  }

  private buildAlerts(input: { dceModule: CockpitModuleSummary; deliverablesBlocked: boolean; readinessStatus: string; latestSubmissionStatus?: string | undefined }): CockpitAlert[] {
    const alerts: CockpitAlert[] = [];
    if (input.dceModule.status === CockpitModuleStatus.InProgress) {
      alerts.push({ level: CockpitAlertLevel.Warning, code: "DCE_EMPTY" });
    }
    if (input.deliverablesBlocked) {
      alerts.push({ level: CockpitAlertLevel.Blocker, code: "DELIVERABLE_BLOCKED" });
    }
    if (input.readinessStatus === ReadinessStatus.Blocked) {
      alerts.push({ level: CockpitAlertLevel.Blocker, code: "VALIDATION_OR_SIGNATURE_BLOCKED" });
    }
    if (input.readinessStatus === ReadinessStatus.ReadyWithWarnings) {
      alerts.push({ level: CockpitAlertLevel.Warning, code: "VALIDATION_WARNINGS" });
    }
    if (input.latestSubmissionStatus === TenderSubmissionStatus.SubmissionRejected) {
      alerts.push({ level: CockpitAlertLevel.Blocker, code: "SUBMISSION_REJECTED" });
    }
    return alerts;
  }
}
