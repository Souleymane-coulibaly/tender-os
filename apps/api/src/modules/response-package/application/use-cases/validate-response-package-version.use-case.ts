import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { computePackageCompleteness } from "../../domain/services/compute-package-completeness";
import { ResponsePackageValidationBlockedError, ResponsePackageVersionNotFoundError } from "../../domain/errors";
import type { ResponsePackageVersion } from "../../domain/response-package-version.entity";
import { assertResponsePackageAccess } from "../policies/response-package-access.policy";
import { ResponsePackageAccessService } from "../services/response-package-access.service";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { PACKAGE_ITEM_REPOSITORY, type PackageItemRepository } from "../ports/package-item.repository";
import { RESPONSE_PACKAGE_REPOSITORY, type ResponsePackageRepository } from "../ports/response-package.repository";
import { RESPONSE_PACKAGE_VERSION_REPOSITORY, type ResponsePackageVersionRepository } from "../ports/response-package-version.repository";

export type ValidateResponsePackageVersionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  responsePackageId: string;
  responsePackageVersionId: string;
  requestId?: string | undefined;
}>;

/**
 * Validation humaine explicite (mission §42) — TenderOS ne valide JAMAIS automatiquement le
 * dossier. Mission §26/§44 : le SEUL blocage réel est au moins une pièce REQUIRED (ou CONDITIONAL
 * devenue applicable) + APPLICABLE + MANQUANTE — jamais un OPTIONAL absent (§43), jamais un
 * NOT_APPLICABLE (§45), jamais une CONDITIONAL non satisfaite (§46), jamais un NEEDS_REVIEW (§47,
 * "ne pas transformer NEEDS_REVIEW en document obligatoire manquant"). Contrairement à
 * `ValidatePricingScheduleVersionUseCase` (Sprint 13), la mission ne prévoit AUCUN mécanisme de
 * contournement avec justification ici — un blocage réel bloque, sans exception.
 */
@Injectable()
export class ValidateResponsePackageVersionUseCase {
  constructor(
    @Inject(RESPONSE_PACKAGE_REPOSITORY) private readonly packageRepository: ResponsePackageRepository,
    @Inject(RESPONSE_PACKAGE_VERSION_REPOSITORY) private readonly versionRepository: ResponsePackageVersionRepository,
    @Inject(PACKAGE_ITEM_REPOSITORY) private readonly itemRepository: PackageItemRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly accessService: ResponsePackageAccessService,
  ) {}

  async execute(command: ValidateResponsePackageVersionCommand): Promise<ResponsePackageVersion> {
    const pkg = await assertResponsePackageAccess(this.accessService, {
      organizationId: command.organizationId,
      responsePackageId: command.responsePackageId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.ValidateResponsePackage,
      requireUseOrgPermission: true,
    });

    const version = await this.versionRepository.findById({ organizationId: command.organizationId, responsePackageVersionId: command.responsePackageVersionId });
    if (!version || version.responsePackageId !== pkg.id) {
      throw new ResponsePackageVersionNotFoundError();
    }

    const items = await this.itemRepository.listByVersion({ organizationId: command.organizationId, responsePackageVersionId: version.id });
    const completeness = computePackageCompleteness(
      items.map((item) => ({ id: item.id, label: item.label, requirementType: item.requirementType, applicabilityStatus: item.applicabilityStatus, hasDocumentVersion: item.documentVersionId !== undefined })),
    );

    if (!completeness.ready) {
      throw new ResponsePackageValidationBlockedError(completeness.requiredMissingLabels);
    }

    const occurredAt = this.clock.now();
    version.validate({ validatedBy: command.actorId, occurredAt });
    pkg.markValidated(occurredAt);

    await this.atomicTransactionRunner.run(async () => {
      await this.versionRepository.save(version);
      await this.packageRepository.save(pkg);
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "response_package.validated",
        resourceType: "response_package_version",
        resourceId: version.id,
        requestId: command.requestId,
        metadata: { responsePackageId: pkg.id, versionNumber: version.versionNumber, requiredApplicableTotal: completeness.requiredApplicableTotal },
      });
    });

    return version;
  }
}
