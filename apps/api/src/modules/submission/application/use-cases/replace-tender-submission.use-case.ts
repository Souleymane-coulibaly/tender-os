import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { TenderSubmission } from "../../domain/tender-submission.aggregate";
import {
  CustomPlatformNameRequiredError,
  SubmissionDeadlinePassedError,
  TenderSubmissionAlreadyReplacedError,
  TenderSubmissionNotFoundError,
} from "../../domain/errors";
import { requiresCustomPlatformName, type SubmissionPlatform } from "../../domain/submission-platform";
import { TenderSubmissionStatus } from "../../domain/tender-submission-status";
import { toTenderSubmissionSummary, type TenderSubmissionSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_SUBMISSION_REPOSITORY, type TenderSubmissionRepository } from "../ports/tender-submission.repository";
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
 */
@Injectable()
export class ReplaceTenderSubmissionUseCase {
  constructor(
    private readonly accessService: SubmissionAccessService,
    private readonly packageResolver: SubmissionPackageResolverService,
    @Inject(TENDER_SUBMISSION_REPOSITORY) private readonly submissionRepository: TenderSubmissionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: ReplaceTenderSubmissionCommand): Promise<TenderSubmissionSummary> {
    const previous = await this.submissionRepository.findById({ organizationId: command.organizationId, submissionId: command.submissionId });
    if (!previous) {
      throw new TenderSubmissionNotFoundError();
    }
    const tender = await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: previous.tenderId, permission: ClientPermission.ManageSubmission });

    if (previous.status === TenderSubmissionStatus.Replaced) {
      throw new TenderSubmissionAlreadyReplacedError();
    }
    if (requiresCustomPlatformName(command.platform) && !command.customPlatformName?.trim()) {
      throw new CustomPlatformNameRequiredError();
    }
    if (tender.submissionDeadline && command.submittedAt.getTime() > new Date(tender.submissionDeadline).getTime()) {
      throw new SubmissionDeadlinePassedError();
    }

    const resolvedPackage = await this.packageResolver.resolveExactPackage({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: previous.tenderId, packageId: command.packageId });

    const occurredAt = this.clock.now();
    const next = TenderSubmission.record({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: previous.tenderId,
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
      supersedesSubmissionId: previous.id,
      occurredAt,
    });
    previous.markReplaced({ replacedBySubmissionId: next.id, occurredAt });

    await this.submissionRepository.replaceActive({ previous, next });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "TENDER_SUBMISSION_REPLACED",
      resourceType: "TENDER_SUBMISSION",
      resourceId: next.id,
      metadata: { supersedesSubmissionId: previous.id },
    });

    return toTenderSubmissionSummary(next, []);
  }
}
