import { Inject, Injectable } from "@nestjs/common";
import { CountActiveMembersUseCase } from "../../../memberships";
import { SuspendOrganizationUseCase } from "../../../organizations";
import { PlatformCapability } from "../../domain/platform-capability";
import type { PlatformRole } from "../../domain/platform-role";
import { PLATFORM_AUDIT_LOG_WRITER, type PlatformAuditLogWriter } from "../ports/platform-audit-log.port";
import { assertHasCapability } from "../policies/platform-authorization.policy";
import type { PlatformOrganizationView } from "./list-platform-organizations.use-case";

export type SuspendPlatformOrganizationCommand = Readonly<{
  actorId: string;
  actorRole: PlatformRole;
  organizationId: string;
  /** Facultative — aucune règle documentée ne rend une justification obligatoire pour Organization. */
  reason?: string | undefined;
  requestId?: string | undefined;
}>;

export type SuspendPlatformOrganizationResult = PlatformOrganizationView;

@Injectable()
export class SuspendPlatformOrganizationUseCase {
  constructor(
    private readonly suspendOrganizationUseCase: SuspendOrganizationUseCase,
    private readonly countActiveMembersUseCase: CountActiveMembersUseCase,
    @Inject(PLATFORM_AUDIT_LOG_WRITER) private readonly auditLogWriter: PlatformAuditLogWriter,
  ) {}

  async execute(command: SuspendPlatformOrganizationCommand): Promise<SuspendPlatformOrganizationResult> {
    assertHasCapability(command.actorRole, PlatformCapability.OrganizationsSuspend);

    const organization = await this.suspendOrganizationUseCase.execute({ id: command.organizationId });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "platform.organization.suspended",
      resourceId: command.organizationId,
      requestId: command.requestId,
      metadata: command.reason ? { reason: command.reason } : undefined,
    });

    const activeMemberCount = await this.countActiveMembersUseCase.execute({
      organizationId: command.organizationId,
    });

    return { ...organization, activeMemberCount };
  }
}
