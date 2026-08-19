import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { TenderSubmission } from "../../domain/tender-submission.aggregate";
import {
  ActiveTenderSubmissionAlreadyExistsError,
  CustomPlatformNameRequiredError,
  SubmissionDeadlinePassedError,
  SubmissionPackageVersionMismatchError,
  TenderNotReadyForSubmissionError,
} from "../../domain/errors";
import { SubmissionReadinessReasonSeverity } from "../../domain/submission-readiness-reason";
import { requiresCustomPlatformName, type SubmissionPlatform } from "../../domain/submission-platform";
import { TenderSubmissionStatus } from "../../domain/tender-submission-status";
import { toTenderSubmissionSummary, type TenderSubmissionSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_SUBMISSION_REPOSITORY, type TenderSubmissionRepository } from "../ports/tender-submission.repository";
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
    @Inject(TENDER_SUBMISSION_REPOSITORY) private readonly submissionRepository: TenderSubmissionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

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
      active.recordFromInProgress({
        submittedByUserId: command.actorId,
        submittedAt: command.submittedAt,
        platform: command.platform,
        customPlatformName: command.customPlatformName,
        platformReference: command.platformReference,
        receiptReference: command.receiptReference,
        notes: command.notes,
        occurredAt,
      });
      await this.submissionRepository.save(active);
      await this.auditLogWriter.record({ organizationId: command.organizationId, actorType: "USER", actorId: command.actorId, action: "TENDER_SUBMISSION_RECORDED", resourceType: "TENDER_SUBMISSION", resourceId: active.id });
      return toTenderSubmissionSummary(active, []);
    }

    if (active) {
      throw new ActiveTenderSubmissionAlreadyExistsError();
    }

    const resolvedPackage = await this.packageResolver.resolveExactPackage({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId, packageId: command.packageId });

    const submission = TenderSubmission.record({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      packageId: resolvedPackage.packageId,
      packageVersion: resolvedPackage.packageVersion,
      packageHash: resolvedPackage.packageHash,
      manifestHash: resolvedPackage.manifestHash,
      submittedByUserId: command.actorId,
      submittedAt: command.submittedAt,
      platform: command.platform,
      customPlatformName: command.customPlatformName,
      platformReference: command.platformReference,
      receiptReference: command.receiptReference,
      notes: command.notes,
      occurredAt,
    });
    await this.submissionRepository.create(submission);

    await this.auditLogWriter.record({ organizationId: command.organizationId, actorType: "USER", actorId: command.actorId, action: "TENDER_SUBMISSION_RECORDED", resourceType: "TENDER_SUBMISSION", resourceId: submission.id });

    return toTenderSubmissionSummary(submission, []);
  }
}
