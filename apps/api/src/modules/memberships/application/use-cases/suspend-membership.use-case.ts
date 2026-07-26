import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { MembershipNotFoundError } from "../../domain/errors";
import { OrganizationPermission } from "../../domain/organization-permission";
import type { OrganizationRole } from "../../domain/organization-role";
import { toMembershipSummary, type MembershipSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from "../ports/membership.repository";
import { assertNotLastActiveOrganizationAdmin } from "../policies/last-admin.policy";
import { assertHasPermission } from "../policies/membership-authorization.policy";

export type SuspendMembershipCommand = Readonly<{
  organizationId: string;
  membershipId: string;
  actorId: string;
  actorRole: OrganizationRole;
  requestId?: string | undefined;
}>;

export type SuspendMembershipResult = MembershipSummary;

@Injectable()
export class SuspendMembershipUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: MembershipRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SuspendMembershipCommand): Promise<SuspendMembershipResult> {
    assertHasPermission(command.actorRole, OrganizationPermission.MemberSuspend);

    const membership = await this.membershipRepository.findById({
      organizationId: command.organizationId,
      membershipId: command.membershipId,
    });

    if (!membership) {
      throw new MembershipNotFoundError();
    }

    await assertNotLastActiveOrganizationAdmin({
      membershipRepository: this.membershipRepository,
      organizationId: command.organizationId,
      membership,
    });

    const occurredAt = this.clock.now();

    membership.suspend(occurredAt);

    await this.membershipRepository.save(membership);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "organization_membership.suspended",
      resourceId: membership.id.value,
      requestId: command.requestId,
    });

    return toMembershipSummary(membership);
  }
}
