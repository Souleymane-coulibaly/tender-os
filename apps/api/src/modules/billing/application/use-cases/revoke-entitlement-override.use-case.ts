import { Inject, Injectable } from "@nestjs/common";
import { assertHasCapability, PlatformCapability, type PlatformRole } from "../../../platform-administration";
import { EntitlementOverrideNotFoundError } from "../../domain/errors";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ENTITLEMENT_OVERRIDE_REPOSITORY, type EntitlementOverrideRepository } from "../ports/entitlement-override.repository";

export type RevokeEntitlementOverrideCommand = Readonly<{
  organizationId: string;
  overrideId: string;
  actorPlatformAdministratorId: string;
  actorPlatformRole: PlatformRole;
  occurredAt: Date;
}>;

@Injectable()
export class RevokeEntitlementOverrideUseCase {
  constructor(
    @Inject(ENTITLEMENT_OVERRIDE_REPOSITORY) private readonly overrideRepository: EntitlementOverrideRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: RevokeEntitlementOverrideCommand): Promise<void> {
    assertHasCapability(command.actorPlatformRole, PlatformCapability.EntitlementOverridesManage);

    const override = await this.overrideRepository.findById(command.organizationId, command.overrideId);
    if (!override) {
      throw new EntitlementOverrideNotFoundError(command.overrideId);
    }

    override.revoke({ revokedByPlatformAdministratorId: command.actorPlatformAdministratorId, occurredAt: command.occurredAt });
    await this.overrideRepository.save(override);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorPlatformAdministratorId,
      action: "EntitlementOverrideChanged",
      resourceType: "EntitlementOverride",
      resourceId: override.id,
      metadata: { revoked: true, feature: override.feature, quota: override.quota },
    });
  }
}
