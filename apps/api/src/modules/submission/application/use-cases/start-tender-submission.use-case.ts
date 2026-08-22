import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ENTITLEMENT_SERVICE, type EntitlementService } from "../../../billing";
import { ClientPermission } from "../../../client-portfolio";
import { TenderSubmission } from "../../domain/tender-submission.aggregate";
import { ActiveTenderSubmissionAlreadyExistsError, CustomPlatformNameRequiredError } from "../../domain/errors";
import { requiresCustomPlatformName, type SubmissionPlatform } from "../../domain/submission-platform";
import { toTenderSubmissionSummary, type TenderSubmissionSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_SUBMISSION_REPOSITORY, type TenderSubmissionRepository } from "../ports/tender-submission.repository";
import { SubmissionAccessService } from "../services/submission-access.service";
import { SubmissionPackageResolverService } from "../services/submission-package-resolver.service";

export type StartTenderSubmissionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  packageId: string;
  platform: SubmissionPlatform;
  customPlatformName?: string | undefined;
}>;

/** Mission §7/§23 — "marquer le dépôt comme commencé", pas obligatoire mais audité et tracé
 *  distinctement (mission §17 "dépôt démarré"). */
@Injectable()
export class StartTenderSubmissionUseCase {
  constructor(
    private readonly accessService: SubmissionAccessService,
    private readonly packageResolver: SubmissionPackageResolverService,
    @Inject(TENDER_SUBMISSION_REPOSITORY) private readonly submissionRepository: TenderSubmissionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(ENTITLEMENT_SERVICE) private readonly entitlementService: EntitlementService,
  ) {}

  async execute(command: StartTenderSubmissionCommand): Promise<TenderSubmissionSummary> {
    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId, permission: ClientPermission.ManageSubmission });

    // Checkpoint TENDEROS-2.1-P2.3-E1.3 — ferme le finding Codex "Submission.start non gaté" :
    // AVANT toute mutation persistante (mission §3), allocation du Pass (si nécessaire) avec
    // compensation automatique si l'opération échoue ensuite (mission §2/§4).
    return this.entitlementService.runTenderOperationEntitled(
      { organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, occurredAt: this.clock.now() },
      async () => this.executeEntitled(command),
    );
  }

  private async executeEntitled(command: StartTenderSubmissionCommand): Promise<TenderSubmissionSummary> {
    if (requiresCustomPlatformName(command.platform) && !command.customPlatformName?.trim()) {
      throw new CustomPlatformNameRequiredError();
    }

    const active = await this.submissionRepository.findActiveForTender({ organizationId: command.organizationId, tenderId: command.tenderId });
    if (active) {
      throw new ActiveTenderSubmissionAlreadyExistsError();
    }

    const resolvedPackage = await this.packageResolver.resolveExactPackage({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: command.tenderId, packageId: command.packageId });

    const occurredAt = this.clock.now();
    const submission = TenderSubmission.start({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      packageId: resolvedPackage.packageId,
      packageVersion: resolvedPackage.packageVersion,
      packageHash: resolvedPackage.packageHash,
      manifestHash: resolvedPackage.manifestHash,
      startedByUserId: command.actorId,
      platform: command.platform,
      customPlatformName: command.customPlatformName,
      occurredAt,
    });
    await this.submissionRepository.create(submission);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "TENDER_SUBMISSION_STARTED",
      resourceType: "TENDER_SUBMISSION",
      resourceId: submission.id,
    });

    return toTenderSubmissionSummary(submission, []);
  }
}
