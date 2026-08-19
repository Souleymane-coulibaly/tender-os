import { Inject, Injectable } from "@nestjs/common";
import { GetEffectiveTenderAnalysisSummaryUseCase, TenderBusinessAnalysisNotFoundError } from "../../../analysis";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { EXPORT_JOB_REPOSITORY, ExportJobNotFoundError, GenerateFinalExportUseCase, type ExportJobRepository } from "../../../export";
import { GetTechnicalMemoRevisionFingerprintForTenderUseCase } from "../../../technical-memo";
import { GetTenderUseCase } from "../../../tenders";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { FinalApproval } from "../../domain/final-approval.aggregate";
import { ValidationRunNotFoundError } from "../../domain/errors";
import { ReadinessStatus } from "../../domain/readiness-status";
import { toFinalApprovalSummary, type FinalApprovalSummary } from "../dtos";
import type { ExportJobSummary } from "../../../export";
import { FINAL_APPROVAL_REPOSITORY, type FinalApprovalRepository } from "../ports/final-approval.repository";
import { VALIDATION_RUN_REPOSITORY, type ValidationRunRepository } from "../ports/validation-run.repository";

export type ApproveFinalVersionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  validationRunId: string;
  comment?: string | undefined;
}>;

export type ApproveFinalVersionResult = Readonly<{ approval: FinalApprovalSummary; finalExport: ExportJobSummary }>;

/**
 * Mission Sprint 8A §28/§31 — approuve un run de validation SANS contrôle bloquant ouvert (vérifié
 * sur l'état ACTUEL des issues, mission "ne se fie jamais uniquement au readiness figé au moment
 * du run"), puis déclenche IMMÉDIATEMENT le figeage de l'export FINAL (mission "approuver → export
 * final figé" comme un seul flux continu, jamais une étape manuelle séparée qui pourrait dériver).
 * Réservé à `ClientPermission.ApproveExport` ("règle stricte", mission §42/§56).
 *
 * Atomicité (audit de correction) — le figeage de l'export FINAL est exécuté AVANT toute
 * persistance de la `FinalApproval` : si `GenerateFinalExportUseCase` échoue (rendu, stockage...),
 * l'exception se propage et AUCUNE ligne `FinalApproval` n'est créée — jamais une approbation
 * active sans export final exploitable derrière elle. `FinalApproval.exportJobId`/`manifestHash`
 * référencent le job et le hash de l'export FINAL réellement produit (jamais celui de l'aperçu
 * PREVIEW qui a servi de base) : `SubmissionPackage` et tout consommateur futur de l'approbation
 * doivent pouvoir résoudre directement l'artefact FINAL sans jamais retomber sur l'aperçu
 * filigrané.
 */
@Injectable()
export class ApproveFinalVersionUseCase {
  constructor(
    @Inject(FINAL_APPROVAL_REPOSITORY) private readonly finalApprovalRepository: FinalApprovalRepository,
    @Inject(VALIDATION_RUN_REPOSITORY) private readonly validationRunRepository: ValidationRunRepository,
    @Inject(EXPORT_JOB_REPOSITORY) private readonly exportJobRepository: ExportJobRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly generateFinalExportUseCase: GenerateFinalExportUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly getEffectiveTenderAnalysisSummaryUseCase: GetEffectiveTenderAnalysisSummaryUseCase,
    private readonly getTechnicalMemoRevisionFingerprintForTenderUseCase: GetTechnicalMemoRevisionFingerprintForTenderUseCase,
  ) {}

  /**
   * Checkpoint 2.1-P2.1-FIX-E — résout la provenance MINIMALE du dossier métier (mission §10-11)
   * juste avant de créer la `FinalApproval` réellement persistée. `undefined` sur l'analyse si
   * aucune n'a jamais réussi pour ce tender (dimension non applicable, jamais une dépendance
   * fabriquée — `TenderBusinessAnalysisNotFoundError` est le signal EXPLICITE de ce cas, jamais une
   * erreur inattendue à laisser remonter et bloquer une approbation par ailleurs légitime).
   */
  private async resolveDossierProvenance(input: {
    organizationId: string;
    actorId: string;
    actorRole: string;
    tenderId: string;
  }): Promise<{ analysisVersion: number | undefined; dceRevision: number | undefined; technicalMemoRevisionFingerprint: string | undefined }> {
    let analysisVersion: number | undefined;
    let dceRevision: number | undefined;
    try {
      const analysis = await this.getEffectiveTenderAnalysisSummaryUseCase.execute({ organizationId: input.organizationId, tenderId: input.tenderId, actorId: input.actorId, actorRole: input.actorRole });
      analysisVersion = analysis.analysisVersion;
      dceRevision = analysis.dceRevision;
    } catch (error) {
      if (!(error instanceof TenderBusinessAnalysisNotFoundError)) throw error;
    }

    const technicalMemoRevisionFingerprint = await this.getTechnicalMemoRevisionFingerprintForTenderUseCase.execute({
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });

    return { analysisVersion, dceRevision, technicalMemoRevisionFingerprint };
  }

  async execute(command: ApproveFinalVersionCommand): Promise<ApproveFinalVersionResult> {
    const tender = await this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, actorRole: command.actorRole });
    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ApproveExport,
    });

    const run = await this.validationRunRepository.findById({ organizationId: command.organizationId, validationRunId: command.validationRunId });
    if (!run) {
      throw new ValidationRunNotFoundError();
    }

    const found = await this.exportJobRepository.findById({ organizationId: command.organizationId, exportJobId: run.exportJobId });
    if (!found || !found.artifact) {
      throw new ExportJobNotFoundError();
    }

    const occurredAt = this.clock.now();

    // Validation précoce, pure (aucune E/S) — échoue rapidement sur un contrôle bloquant ouvert
    // AVANT de déclencher le rendu coûteux du figeage FINAL. Ce premier objet n'est jamais
    // persisté : seule sa construction sert de garde ; l'approbation réellement enregistrée est
    // reconstruite ci-dessous avec les données de l'export FINAL une fois celui-ci confirmé.
    FinalApproval.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      tenderId: command.tenderId,
      exportJobId: run.exportJobId,
      validationRunId: run.id,
      manifestHash: found.artifact.fileHash,
      approvedBy: command.actorId,
      approverRole: command.actorRole,
      comment: command.comment,
      previousStatus: ReadinessStatus.ReadyForApproval,
      nextStatus: ReadinessStatus.Approved,
      occurredAt,
      currentIssues: run.issues,
    });

    // Mission §22/§32 — le figeage FINAL est déclenché ICI, AVANT toute persistance
    // d'approbation, jamais par un contrôleur HTTP exposé directement (voir docstring de
    // `GenerateFinalExportUseCase`, module Export — évite tout cycle de modules). Si cet appel
    // échoue, l'exception se propage immédiatement et rien n'est écrit.
    // Checkpoint 2.1-P2.1-FIX-E — la résolution de provenance (lecture seule, indépendante du
    // figeage de l'export) est menée EN PARALLÈLE, jamais un aller-retour séquentiel supplémentaire.
    const [finalExport, dossierProvenance] = await Promise.all([
      this.generateFinalExportUseCase.execute({
        organizationId: command.organizationId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        tenderId: command.tenderId,
        basedOnExportJobId: run.exportJobId,
        expectedManifestHash: found.artifact.fileHash,
      }),
      this.resolveDossierProvenance({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId }),
    ]);
    if (!finalExport.artifact) {
      // Ne devrait jamais se produire (le pipeline de rendu échoue explicitement sinon), mais
      // jamais supposé silencieusement — voir mission "aucune substitution silencieuse".
      throw new ExportJobNotFoundError();
    }

    const approval = FinalApproval.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      tenderId: command.tenderId,
      exportJobId: finalExport.id,
      validationRunId: run.id,
      manifestHash: finalExport.artifact.fileHash,
      approvedBy: command.actorId,
      approverRole: command.actorRole,
      comment: command.comment,
      previousStatus: ReadinessStatus.ReadyForApproval,
      nextStatus: ReadinessStatus.Approved,
      occurredAt,
      currentIssues: run.issues,
      candidateCompanyId: tender.candidateCompanyId,
      analysisVersion: dossierProvenance.analysisVersion,
      dceRevision: dossierProvenance.dceRevision,
      technicalMemoRevisionFingerprint: dossierProvenance.technicalMemoRevisionFingerprint,
    });

    await this.finalApprovalRepository.create(approval);

    return { approval: toFinalApprovalSummary(approval), finalExport };
  }
}
