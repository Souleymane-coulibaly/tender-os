import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { TenderSubmission } from "../../domain/tender-submission.aggregate";
import {
  ActiveTenderSubmissionAlreadyExistsError,
  CustomPlatformNameRequiredError,
  ResponsePackageArtifactMissingError,
  SubmissionDeadlinePassedError,
  SubmissionPackageVersionMismatchError,
  TenderNotReadyForSubmissionError,
} from "../../domain/errors";
import { SubmissionReadinessAction, SubmissionReadinessReasonCode, SubmissionReadinessReasonSeverity, SubmissionReadinessReasonSource } from "../../domain/submission-readiness-reason";
import { GetSubmittableResponsePackageVersionUseCase, type SubmittableResponsePackageVersion, type SubmittableResponsePackageVersionForLot } from "../../../response-package";
import { requiresCustomPlatformName, type SubmissionPlatform } from "../../domain/submission-platform";
import type { SubmissionResponsePackageProvenance } from "../../domain/submission-response-package-provenance";
import { TenderSubmissionStatus } from "../../domain/tender-submission-status";
import { toTenderSubmissionSummary, type TenderSubmissionSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_SUBMISSION_REPOSITORY, type TenderSubmissionRepository, type SubmissionResponsePackageProvenanceInput } from "../ports/tender-submission.repository";
import { GetTenderSubmissionReadinessUseCase } from "./get-tender-submission-readiness.use-case";
import { SubmissionAccessService } from "../services/submission-access.service";
import { SubmissionPackageResolverService } from "../services/submission-package-resolver.service";

export type RecordTenderSubmissionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  packageId: string;
  platform: SubmissionPlatform;
  customPlatformName?: string | undefined;
  submittedAt: Date;
  platformReference?: string | undefined;
  receiptReference?: string | undefined;
  notes?: string | undefined;
}>;

/**
 * Mission §11 — enregistre un dépôt manuel. Complète une soumission `SUBMISSION_IN_PROGRESS`
 * démarrée par `StartTenderSubmissionUseCase` si elle existe, sinon en crée une nouvelle
 * directement à SUBMITTED (mission "un dépôt manuel peut être enregistré" en une fois). Refuse
 * silencieusement jamais un dépôt hors délai (mission §28 "ne pas l'accepter silencieusement").
 *
 * Checkpoint 2.1-P2.1-FIX-F.1 (ferme le P1 identifié par l'audit Codex FIX-F : la Submission
 * Readiness V2 était calculée mais jamais consommée par CETTE action) — le guard readiness est
 * ADDITIF aux guards legacy déjà en place ci-dessous (deadline, package `submission-package` via
 * `packageResolver.resolveExactPackage`), jamais un remplacement : les deux pipelines
 * (`submission-package` legacy et Candidate/Analyse/.../Response Package FIX-A..E) restent
 * structurellement disjoints, mais l'action finale exige désormais ZÉRO raison BLOCKING sur
 * l'UNE ET L'AUTRE dimension. Réutilise `GetTenderSubmissionReadinessUseCase.resolveFileReadinessReasons`
 * TEL QUEL (même calcul que `GET .../submission-readiness`, mission §11 "ne jamais dupliquer les
 * règles métier FIX-A..E ici") — recalculé à CET instant précis (mission §15 "TOCTOU : le guard
 * doit être exécuté DANS l'action, jamais un snapshot d'une requête GET antérieure").
 */
@Injectable()
export class RecordTenderSubmissionUseCase {
  constructor(
    private readonly accessService: SubmissionAccessService,
    private readonly packageResolver: SubmissionPackageResolverService,
    private readonly getReadinessUseCase: GetTenderSubmissionReadinessUseCase,
    private readonly getSubmittableResponsePackageVersionUseCase: GetSubmittableResponsePackageVersionUseCase,
    @Inject(TENDER_SUBMISSION_REPOSITORY) private readonly submissionRepository: TenderSubmissionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  /**
   * Checkpoint TENDEROS-2.1-P2.2-F2.1/F2.3 (ferme le gap identifié par l'audit F2 : SEUL le flux
   * direct `record()` appelait ce resolver, jamais le flux `start()->recordFromInProgress()`, alors
   * que ce dernier finalise lui aussi un dépôt réel) — résolution UNIQUE, partagée par les deux
   * branches ci-dessous, jamais dupliquée (mission §7/§12 "réutiliser le SOT existant"). Même
   * sémantique que F2 : `AMBIGUOUS_OR_ABSENT` reste silencieux (legacy continue) ; `ARTIFACT_MISSING`
   * refuse proprement (mission §67/§30). `LOT_RESPONSE_PACKAGE_MISSING` (mission §13/§14) ne devrait
   * JAMAIS survenir ici en pratique — la readiness recalculée juste avant (§100 ci-dessous) a déjà
   * bloqué ce cas — mais reste géré défensivement (fenêtre TOCTOU extrême) en réutilisant le MÊME
   * contrat d'erreur que la readiness (`TenderNotReadyForSubmissionError`), jamais un code inventé.
   */
  private async resolveResponsePackageProvenance(
    command: { organizationId: string; actorId: string; actorRole: string; tenderId: string },
  ): Promise<Readonly<{ mode: "GLOBAL"; global: SubmittableResponsePackageVersion | undefined }> | Readonly<{ mode: "LOT"; entries: readonly SubmittableResponsePackageVersionForLot[] }>> {
    const resolution = await this.getSubmittableResponsePackageVersionUseCase.execute(command);
    if (resolution.status === "ARTIFACT_MISSING") {
      throw new ResponsePackageArtifactMissingError();
    }
    if (resolution.status === "LOT_RESPONSE_PACKAGE_MISSING") {
      throw new TenderNotReadyForSubmissionError([
        {
          code: SubmissionReadinessReasonCode.ResponsePackageMissing,
          severity: SubmissionReadinessReasonSeverity.Blocking,
          source: SubmissionReadinessReasonSource.ResponsePackage,
          message: "Le dossier de réponse d'un ou plusieurs lots requis n'est plus résolvable au moment du dépôt.",
          action: SubmissionReadinessAction.RegenerateResponsePackage,
        },
      ]);
    }
    if (resolution.status === "RESOLVED_MULTI_LOT") {
      return { mode: "LOT", entries: resolution.entries };
    }
    return { mode: "GLOBAL", global: resolution.status === "RESOLVED" ? resolution : undefined };
  }

  /** Construit les lignes de provenance MULTI-LOT à persister (mode LOT uniquement) — jamais un
   *  second calcul, purement une projection des entrées déjà résolues (mission §12). */
  private toProvenanceInputs(entries: readonly SubmittableResponsePackageVersionForLot[]): readonly SubmissionResponsePackageProvenanceInput[] {
    return entries.map((entry) => ({ lotId: entry.lotId, responsePackageVersionId: entry.responsePackageVersionId, responsePackageArtifactId: entry.artifactId, artifactChecksum: entry.artifactChecksum }));
  }

  /** DTO de provenance immédiate (mission — jamais une seconde lecture DB juste après l'écriture) :
   *  `id`/`createdAt` n'ont aucune importance pour l'API (voir `toSubmissionResponsePackageProvenanceSummary`,
   *  qui ne les expose pas), seuls les champs métier comptent. */
  private toProvenanceDtos(submissionId: string, occurredAt: Date, entries: readonly SubmittableResponsePackageVersionForLot[]): readonly SubmissionResponsePackageProvenance[] {
    return entries.map((entry) => ({
      id: this.idGenerator.generate(),
      submissionId,
      lotId: entry.lotId,
      responsePackageVersionId: entry.responsePackageVersionId,
      responsePackageArtifactId: entry.artifactId,
      artifactChecksum: entry.artifactChecksum,
      createdAt: occurredAt,
    }));
  }

  async execute(command: RecordTenderSubmissionCommand): Promise<TenderSubmissionSummary> {
    const tender = await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId, permission: ClientPermission.ManageSubmission });

    if (requiresCustomPlatformName(command.platform) && !command.customPlatformName?.trim()) {
      throw new CustomPlatformNameRequiredError();
    }
    if (tender.submissionDeadline && command.submittedAt.getTime() > new Date(tender.submissionDeadline).getTime()) {
      throw new SubmissionDeadlinePassedError();
    }

    // Checkpoint 2.1-P2.1-FIX-F.1 — jamais une readiness envoyée/mise en cache par le frontend
    // (mission §5) : recalculée ici, à l'instant T de l'action, contre l'état COURANT de chaque
    // dimension (Candidate/Analyse/Checklist/GO-NO-GO/Mémoire technique/Validation/Response
    // Package). Un WARNING seul (ex. GO/NO-GO = NO_GO) ne bloque jamais — seule une raison BLOCKING
    // interrompt le dépôt, exactement la même politique que `GET .../submission-readiness`.
    const fileReadinessReasons = await this.getReadinessUseCase.resolveFileReadinessReasons(
      { organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId },
      tender.candidateCompanyId,
    );
    const blockingReasons = fileReadinessReasons.filter((reason) => reason.severity === SubmissionReadinessReasonSeverity.Blocking);
    if (blockingReasons.length > 0) {
      throw new TenderNotReadyForSubmissionError(blockingReasons);
    }

    const occurredAt = this.clock.now();
    const active = await this.submissionRepository.findActiveForTender({ organizationId: command.organizationId, tenderId: command.tenderId });

    if (active?.status === TenderSubmissionStatus.SubmissionInProgress) {
      if (active.packageId !== command.packageId) {
        throw new SubmissionPackageVersionMismatchError();
      }
      // Correctif audit Codex P1 — le package a pu être figé au moment de `start()` puis devenir
      // obsolète entre-temps (une nouvelle version COMPLETED générée depuis) : revalider ici,
      // jamais accepter silencieusement un package obsolète parce qu'il correspond simplement au
      // package pinné au démarrage.
      await this.packageResolver.resolveExactPackage({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId, packageId: active.packageId });
      const inProgressProvenance = await this.resolveResponsePackageProvenance({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId });
      active.recordFromInProgress({
        submittedByUserId: command.actorId,
        submittedAt: command.submittedAt,
        platform: command.platform,
        customPlatformName: command.customPlatformName,
        platformReference: command.platformReference,
        receiptReference: command.receiptReference,
        notes: command.notes,
        responsePackageVersionId: inProgressProvenance.mode === "GLOBAL" ? inProgressProvenance.global?.responsePackageVersionId : undefined,
        responsePackageArtifactId: inProgressProvenance.mode === "GLOBAL" ? inProgressProvenance.global?.artifactId : undefined,
        responsePackageArtifactChecksum: inProgressProvenance.mode === "GLOBAL" ? inProgressProvenance.global?.artifactChecksum : undefined,
        occurredAt,
      });
      const inProgressProvenanceRows = inProgressProvenance.mode === "LOT" ? this.toProvenanceInputs(inProgressProvenance.entries) : [];
      await this.submissionRepository.save(active, inProgressProvenanceRows);
      await this.auditLogWriter.record({ organizationId: command.organizationId, actorType: "USER", actorId: command.actorId, action: "TENDER_SUBMISSION_RECORDED", resourceType: "TENDER_SUBMISSION", resourceId: active.id });
      const inProgressProvenanceDtos = inProgressProvenance.mode === "LOT" ? this.toProvenanceDtos(active.id, occurredAt, inProgressProvenance.entries) : [];
      return toTenderSubmissionSummary(active, [], inProgressProvenanceDtos);
    }

    if (active) {
      throw new ActiveTenderSubmissionAlreadyExistsError();
    }

    const resolvedPackage = await this.packageResolver.resolveExactPackage({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId, packageId: command.packageId });

    // Checkpoint TENDEROS-2.1-P2.2-F2 — provenance ADDITIVE du dossier de réponse V2 (mission §11
    // "réutiliser le snapshot déjà généré, jamais reconstruire le ZIP ici"), figée au moment du
    // dépôt, jamais recalculée. `AMBIGUOUS_OR_ABSENT` (0/plusieurs dossiers, Tender multi-lot, ou
    // version courante non validée) laisse ce champ vide — le dépôt legacy continue alors
    // normalement, jamais bloqué pour cette seule raison (mission §16 "ne pas supprimer/bloquer le
    // legacy sans preuve"). `ARTIFACT_MISSING` (mission §67) est en revanche une résolution SANS
    // AMBIGUÏTÉ dont le seul défaut est l'absence de ZIP généré — refus propre, jamais silencieux.
    const provenance = await this.resolveResponsePackageProvenance({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId });

    const submission = TenderSubmission.record({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      packageId: resolvedPackage.packageId,
      packageVersion: resolvedPackage.packageVersion,
      packageHash: resolvedPackage.packageHash,
      manifestHash: resolvedPackage.manifestHash,
      responsePackageVersionId: provenance.mode === "GLOBAL" ? provenance.global?.responsePackageVersionId : undefined,
      responsePackageArtifactId: provenance.mode === "GLOBAL" ? provenance.global?.artifactId : undefined,
      responsePackageArtifactChecksum: provenance.mode === "GLOBAL" ? provenance.global?.artifactChecksum : undefined,
      submittedByUserId: command.actorId,
      submittedAt: command.submittedAt,
      platform: command.platform,
      customPlatformName: command.customPlatformName,
      platformReference: command.platformReference,
      receiptReference: command.receiptReference,
      notes: command.notes,
      occurredAt,
    });
    const provenanceRows = provenance.mode === "LOT" ? this.toProvenanceInputs(provenance.entries) : [];
    await this.submissionRepository.create(submission, provenanceRows);

    await this.auditLogWriter.record({ organizationId: command.organizationId, actorType: "USER", actorId: command.actorId, action: "TENDER_SUBMISSION_RECORDED", resourceType: "TENDER_SUBMISSION", resourceId: submission.id });

    const provenanceDtos = provenance.mode === "LOT" ? this.toProvenanceDtos(submission.id, occurredAt, provenance.entries) : [];
    return toTenderSubmissionSummary(submission, [], provenanceDtos);
  }
}
