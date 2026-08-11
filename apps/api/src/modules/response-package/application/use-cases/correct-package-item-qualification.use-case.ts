import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import type { PackageItemApplicabilityStatus, PackageItemRequirementType } from "../../domain/enums";
import type { PackageItem } from "../../domain/package-item.entity";
import { assertResponsePackageAccess } from "../policies/response-package-access.policy";
import { ResponsePackageAccessService } from "../services/response-package-access.service";
import { PackageItemEditGuard } from "../services/package-item-edit-guard.service";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { PACKAGE_ITEM_REPOSITORY, type PackageItemRepository } from "../ports/package-item.repository";

export type CorrectPackageItemQualificationCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  responsePackageId: string;
  packageItemId: string;
  requirementType: PackageItemRequirementType;
  applicabilityStatus: PackageItemApplicabilityStatus;
  conditionText?: string | undefined;
  requestId?: string | undefined;
}>;

/** Mission §21/§72 — correction humaine de la qualification (REQUIRED→OPTIONAL,
 *  CONDITIONAL→NOT_APPLICABLE, etc.), jamais une modification de la Checklist/DCE source (mission
 *  §32). Toujours tracée (AuditLog), jamais silencieuse. */
@Injectable()
export class CorrectPackageItemQualificationUseCase {
  constructor(
    @Inject(PACKAGE_ITEM_REPOSITORY) private readonly itemRepository: PackageItemRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly accessService: ResponsePackageAccessService,
    private readonly editGuard: PackageItemEditGuard,
  ) {}

  async execute(command: CorrectPackageItemQualificationCommand): Promise<PackageItem> {
    await assertResponsePackageAccess(this.accessService, {
      organizationId: command.organizationId,
      responsePackageId: command.responsePackageId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.ManageResponsePackage,
      requireUseOrgPermission: true,
    });

    const { item } = await this.editGuard.loadEditableItem({ organizationId: command.organizationId, responsePackageId: command.responsePackageId, packageItemId: command.packageItemId });

    const previousRequirementType = item.requirementType;
    const previousApplicabilityStatus = item.applicabilityStatus;

    const occurredAt = this.clock.now();
    item.correctQualification({ requirementType: command.requirementType, applicabilityStatus: command.applicabilityStatus, conditionText: command.conditionText, occurredAt });
    await this.itemRepository.save(item);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "response_package.item_qualification_corrected",
      resourceType: "package_item",
      resourceId: item.id,
      requestId: command.requestId,
      metadata: {
        responsePackageId: command.responsePackageId,
        from: { requirementType: previousRequirementType, applicabilityStatus: previousApplicabilityStatus },
        to: { requirementType: item.requirementType, applicabilityStatus: item.applicabilityStatus },
      },
    });

    return item;
  }
}
