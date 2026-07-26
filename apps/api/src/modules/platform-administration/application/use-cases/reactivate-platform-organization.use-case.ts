import { Inject, Injectable } from "@nestjs/common";
import { CountActiveMembersUseCase } from "../../../memberships";
import { ReactivateOrganizationUseCase } from "../../../organizations";
import { PlatformCapability } from "../../domain/platform-capability";
import type { PlatformRole } from "../../domain/platform-role";
import { PLATFORM_AUDIT_LOG_WRITER, type PlatformAuditLogWriter } from "../ports/platform-audit-log.port";
import { assertHasCapability } from "../policies/platform-authorization.policy";
import type { PlatformOrganizationView } from "./list-platform-organizations.use-case";

export type ReactivatePlatformOrganizationCommand = Readonly<{
  actorId: string;
  actorRole: PlatformRole;
  organizationId: string;
  requestId?: string | undefined;
}>;

export type ReactivatePlatformOrganizationResult = PlatformOrganizationView;

@Injectable()
export class ReactivatePlatformOrganizationUseCase {
  constructor(
    private readonly reactivateOrganizationUseCase: ReactivateOrganizationUseCase,
    private readonly countActiveMembersUseCase: CountActiveMembersUseCase,
    @Inject(PLATFORM_AUDIT_LOG_WRITER) private readonly auditLogWriter: PlatformAuditLogWriter,
  ) {}

  async execute(command: ReactivatePlatformOrganizationCommand): Promise<ReactivatePlatformOrganizationResult> {
    assertHasCapability(command.actorRole, PlatformCapability.OrganizationsReactivate);

    const organization = await this.reactivateOrganizationUseCase.execute({ id: command.organizationId });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "platform.organization.reactivated",
      resourceId: command.organizationId,
      requestId: command.requestId,
    });

    const activeMemberCount = await this.countActiveMembersUseCase.execute({
      organizationId: command.organizationId,
    });

    return { ...organization, activeMemberCount };
  }
}
