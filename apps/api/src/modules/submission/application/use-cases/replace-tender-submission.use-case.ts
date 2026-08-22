import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ENTITLEMENT_SERVICE, type EntitlementService } from "../../../billing";
import { ClientPermission } from "../../../client-portfolio";
import type { TenderSummary } from "../../../tenders";
import { TenderSubmission } from "../../domain/tender-submission.aggregate";
import {
  CustomPlatformNameRequiredError,
  ResponsePackageArtifactMissingError,
  SubmissionDeadlinePassedError,
  TenderNotReadyForSubmissionError,
  TenderSubmissionAlreadyReplacedError,
  TenderSubmissionNotFoundError,
} from "../../domain/errors";
import { GetSubmittableResponsePackageVersionUseCase } from "../../../response-package";
import { requiresCustomPlatformName, type SubmissionPlatform } from "../../domain/submission-platform";
import { SubmissionReadinessAction, SubmissionReadinessReasonCode, SubmissionReadinessReasonSeverity, SubmissionReadinessReasonSource } from "../../domain/submission-readiness-reason";
import { TenderSubmissionStatus } from "../../domain/tender-submission-status";
import { toTenderSubmissionSummary, type TenderSubmissionSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_SUBMISSION_REPOSITORY, type TenderSubmissionRepository } from "../ports/tender-submission.repository";
import { GetTenderSubmissionReadinessUseCase } from "./get-tender-submission-readiness.use-case";
import { SubmissionAccessService } from "../services/submission-access.service";
import { SubmissionPackageResolverService } from "../services/submission-package-resolver.service";

export type ReplaceTenderSubmissionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  submissionId: string;
  packageId: string;
  platform: SubmissionPlatform;
  customPlatformName?: string | undefined;
  submittedAt: Date;
  platformReference?: string | undefined;
  receiptReference?: string | undefined;
  notes?: string | undefined;
}>;

/**
 * Mission §14 — un nouveau dépôt AVANT la date limite : l'ancienne soumission est CONSERVÉE
 * (jamais son reçu/sa preuve/son package écrasés), marquée REPLACED, et une NOUVELLE soumission
 * est créée avec un package final EXACT (potentiellement nouveau) — jamais une mise à jour en
 * place de l'ancienne.
 *
 * Checkpoint TENDEROS-2.1-P2.2-F2.3.1 (ferme le P1 identifié par l'audit Codex F2.3 : ce flux
 * finalise un vrai dépôt SUBMITTED mais ne consommait JAMAIS `GetTenderSubmissionReadinessUseCase`
 * — seul le F2.3 resolver protégeait la dimension Response Package, jamais Candidate/Analyse/
 * Checklist/GO-NO-GO/Mémoire technique/Validation) — même autorité, même contrat d'erreur, même
 * politique BLOCKING/WARNING que `RecordTenderSubmissionUseCase` (mission §2 "UNE autorité backend
 * de readiness", jamais un second calcul local).
 */
@Injectable()
export class ReplaceTenderSubmissionUseCase {
  constructor(
    private readonly accessService: SubmissionAccessService,
    private readonly packageResolver: SubmissionPackageResolverService,
    private readonly getReadinessUseCase: GetTenderSubmissionReadinessUseCase,
    private readonly getSubmittableResponsePackageVersionUseCase: GetSubmittableResponsePackageVersionUseCase,
    @Inject(TENDER_SUBMISSION_REPOSITORY) private readonly submissionRepository: TenderSubmissionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(ENTITLEMENT_SERVICE) private readonly entitlementService: EntitlementService,
  ) {}

  async execute(command: ReplaceTenderSubmissionCommand): Promise<TenderSubmissionSummary> {
    const previous = await this.submissionRepository.findById({ organizationId: command.organizationId, submissionId: command.submissionId });
    if (!previous) {
      throw new TenderSubmissionNotFoundError();
    }
    const tender = await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: previous.tenderId, permission: ClientPermission.ManageSubmission });

    // Checkpoint TENDEROS-2.1-P2.3-E1.3 — ferme le second finding Codex "Submission.replace non
    // gaté" : AVANT toute mutation (mission §4), allocation du Pass (si nécessaire) avec
    // compensation automatique si l'opération échoue ensuite (mission §2). `replace()` ne consomme
    // TOUJOURS PAS de nouveau crédit AO (voir ConsumeAoCreditUseCase, jamais appelé ici) — seul
    // l'accès reste conditionné à l'entitlement, jamais une seconde facturation.
    return this.entitlementService.runTenderOperationEntitled(
      { organizationId: command.organizationId, tenderId: previous.tenderId, actorId: command.actorId, occurredAt: this.clock.now() },
      async () => this.executeEntitled(command, previous, tender),
    );
  }

  private async executeEntitled(command: ReplaceTenderSubmissionCommand, previous: TenderSubmission, tender: TenderSummary): Promise<TenderSubmissionSummary> {
    if (previous.status === TenderSubmissionStatus.Replaced) {
      throw new TenderSubmissionAlreadyReplacedError();
    }
    if (requiresCustomPlatformName(command.platform) && !command.customPlatformName?.trim()) {
      throw new CustomPlatformNameRequiredError();
    }
    if (tender.submissionDeadline && command.submittedAt.getTime() > new Date(tender.submissionDeadline).getTime()) {
      throw new SubmissionDeadlinePassedError();
    }

    // Checkpoint TENDEROS-2.1-P2.2-F2.3.1 — jamais une readiness envoyée/mise en cache par le
    // frontend, recalculée ici à l'instant T contre l'état COURANT de chaque dimension (même appel
    // que `RecordTenderSubmissionUseCase`, mission §2 "réutiliser l'autorité existante, jamais un
    // second calcul"). Un WARNING seul (ex. GO/NO-GO = NO_GO) ne bloque jamais — seule une raison
    // BLOCKING interrompt le remplacement, exactement la même politique que `GET .../submission-readiness`.
    const fileReadinessReasons = await this.getReadinessUseCase.resolveFileReadinessReasons(
      { organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: previous.tenderId },
      tender.candidateCompanyId,
    );
    const blockingReasons = fileReadinessReasons.filter((reason) => reason.severity === SubmissionReadinessReasonSeverity.Blocking);
    if (blockingReasons.length > 0) {
      throw new TenderNotReadyForSubmissionError(blockingReasons);
    }

    const resolvedPackage = await this.packageResolver.resolveExactPackage({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: previous.tenderId, packageId: command.packageId });

    // Checkpoint TENDEROS-2.1-P2.2-F2.1/F2.3 (ferme le gap identifié par l'audit F2 : ce flux
    // finalise un vrai dépôt SUBMITTED via `TenderSubmission.record()` mais n'appelait jamais ce
    // resolver, contrairement au flux direct `RecordTenderSubmissionUseCase`) — même sémantique
    // exacte : `AMBIGUOUS_OR_ABSENT` reste silencieux (legacy continue), `ARTIFACT_MISSING` refuse
    // proprement (mission §67/§30), `LOT_RESPONSE_PACKAGE_MISSING` refuse via le MÊME contrat
    // d'erreur que la readiness (`TenderNotReadyForSubmissionError`) — `replace()` n'a PAS de guard
    // readiness propre (pré-existant, documenté), donc cette vérification y est la SEULE protection
    // contre un lot requis devenu indisponible entre-temps (mission §38 "legacy cannot bypass V2").
    const resolution = await this.getSubmittableResponsePackageVersionUseCase.execute({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: previous.tenderId,
    });
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
    const globalProvenance = resolution.status === "RESOLVED" ? resolution : undefined;
    const lotProvenanceEntries = resolution.status === "RESOLVED_MULTI_LOT" ? resolution.entries : [];

    const occurredAt = this.clock.now();
    const next = TenderSubmission.record({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: previous.tenderId,
      packageId: resolvedPackage.packageId,
      packageVersion: resolvedPackage.packageVersion,
      packageHash: resolvedPackage.packageHash,
      manifestHash: resolvedPackage.manifestHash,
      responsePackageVersionId: globalProvenance?.responsePackageVersionId,
      responsePackageArtifactId: globalProvenance?.artifactId,
      responsePackageArtifactChecksum: globalProvenance?.artifactChecksum,
      submittedByUserId: command.actorId,
      submittedAt: command.submittedAt,
      platform: command.platform,
      customPlatformName: command.customPlatformName,
      platformReference: command.platformReference,
      receiptReference: command.receiptReference,
      notes: command.notes,
      supersedesSubmissionId: previous.id,
      occurredAt,
    });
    previous.markReplaced({ replacedBySubmissionId: next.id, occurredAt });

    const provenanceRows = lotProvenanceEntries.map((entry) => ({ lotId: entry.lotId, responsePackageVersionId: entry.responsePackageVersionId, responsePackageArtifactId: entry.artifactId, artifactChecksum: entry.artifactChecksum }));
    await this.submissionRepository.replaceActive({ previous, next, nextResponsePackageProvenance: provenanceRows });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "TENDER_SUBMISSION_REPLACED",
      resourceType: "TENDER_SUBMISSION",
      resourceId: next.id,
      metadata: { supersedesSubmissionId: previous.id },
    });

    const provenanceDtos = lotProvenanceEntries.map((entry) => ({
      id: this.idGenerator.generate(),
      submissionId: next.id,
      lotId: entry.lotId,
      responsePackageVersionId: entry.responsePackageVersionId,
      responsePackageArtifactId: entry.artifactId,
      artifactChecksum: entry.artifactChecksum,
      createdAt: occurredAt,
    }));
    return toTenderSubmissionSummary(next, [], provenanceDtos);
  }
}
