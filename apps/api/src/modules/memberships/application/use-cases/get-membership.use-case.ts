import { Inject, Injectable } from "@nestjs/common";
import { MembershipNotFoundError } from "../../domain/errors";
import { OrganizationPermission } from "../../domain/organization-permission";
import type { OrganizationRole } from "../../domain/organization-role";
import { toMembershipSummary, type MembershipSummary } from "../dtos";
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from "../ports/membership.repository";
import { assertHasPermission } from "../policies/membership-authorization.policy";

export type GetMembershipQuery = Readonly<{
  organizationId: string;
  membershipId: string;
  actorId: string;
  actorRole: OrganizationRole;
}>;

export type GetMembershipResult = MembershipSummary;

@Injectable()
export class GetMembershipUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: MembershipRepository,
  ) {}

  async execute(query: GetMembershipQuery): Promise<GetMembershipResult> {
    const membership = await this.membershipRepository.findById({
      organizationId: query.organizationId,
      membershipId: query.membershipId,
    });

    if (!membership) {
      throw new MembershipNotFoundError();
    }

    if (membership.userId !== query.actorId) {
      assertHasPermission(query.actorRole, OrganizationPermission.MemberList);
    }

    return toMembershipSummary(membership);
  }
}
