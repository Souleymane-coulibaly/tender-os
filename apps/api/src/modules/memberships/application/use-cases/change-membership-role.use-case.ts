import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { MembershipNotFoundError, OwnershipRequiresTransferError } from "../../domain/errors";
import { OrganizationPermission } from "../../domain/organization-permission";
import { OrganizationRole, parseOrganizationRole } from "../../domain/organization-role";
import { toMembershipSummary, type MembershipSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from "../ports/membership.repository";
import { assertNotLastActiveOrganizationAdmin, assertNotLastActiveOwner } from "../policies/last-admin.policy";
import { assertHasPermission } from "../policies/membership-authorization.policy";

export type ChangeMembershipRoleCommand = Readonly<{
  organizationId: string;
  membershipId: string;
  actorId: string;
  actorRole: OrganizationRole;
  role: string;
  requestId?: string | undefined;
}>;

export type ChangeMembershipRoleResult = MembershipSummary;

@Injectable()
export class ChangeMembershipRoleUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: MembershipRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ChangeMembershipRoleCommand): Promise<ChangeMembershipRoleResult> {
    assertHasPermission(command.actorRole, OrganizationPermission.RoleAssign);

    const nextRole = parseOrganizationRole(command.role);

    // BR-ORG-002/BR-ORG-004 — le rôle OWNER ne s'attribue ni ne se retire jamais par un
    // changement de rôle ordinaire, dans un sens comme dans l'autre : seul
    // TransferOrganizationOwnershipUseCase peut le faire. Vérifié avant même de charger la
    // Membership cible : un ADMIN ne doit jamais pouvoir "essayer" de désigner un OWNER.
    if (nextRole === OrganizationRole.Owner) {
      throw new OwnershipRequiresTransferError();
    }

    const membership = await this.membershipRepository.findById({
      organizationId: command.organizationId,
      membershipId: command.membershipId,
    });

    if (!membership) {
      throw new MembershipNotFoundError();
    }

    if (membership.role === OrganizationRole.Owner) {
      throw new OwnershipRequiresTransferError();
    }

    if (nextRole !== membership.role) {
      await assertNotLastActiveOwner({
        membershipRepository: this.membershipRepository,
        organizationId: command.organizationId,
        membership,
      });
      await assertNotLastActiveOrganizationAdmin({
        membershipRepository: this.membershipRepository,
        organizationId: command.organizationId,
        membership,
      });
    }

    const occurredAt = this.clock.now();
    const previousRole = membership.role;

    membership.changeRole(nextRole, occurredAt);

    await this.membershipRepository.save(membership);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "organization_membership.role_changed",
      resourceId: membership.id.value,
      requestId: command.requestId,
      metadata: { previousRole, nextRole },
    });

    return toMembershipSummary(membership);
  }
}
