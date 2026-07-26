import { Inject, Injectable } from "@nestjs/common";
import { GetCurrentUserUseCase } from "../../../identity";
import { OrganizationPermission } from "../../domain/organization-permission";
import type { OrganizationRole } from "../../domain/organization-role";
import { toMembershipSummary, type MembershipSummary } from "../dtos";
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from "../ports/membership.repository";
import { assertHasPermission } from "../policies/membership-authorization.policy";

export type ListOrganizationMembersQuery = Readonly<{
  organizationId: string;
  actorRole: OrganizationRole;
  cursor?: string | undefined;
  limit: number;
}>;

export type OrganizationMemberView = MembershipSummary & {
  user: { id: string; email: string; displayName: string };
};

export type ListOrganizationMembersResult = Readonly<{
  items: OrganizationMemberView[];
  nextCursor: string | null;
}>;

@Injectable()
export class ListOrganizationMembersUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: MembershipRepository,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
  ) {}

  async execute(query: ListOrganizationMembersQuery): Promise<ListOrganizationMembersResult> {
    assertHasPermission(query.actorRole, OrganizationPermission.MemberList);

    const page = await this.membershipRepository.listByOrganization({
      organizationId: query.organizationId,
      cursor: query.cursor,
      limit: query.limit,
    });

    const items = await Promise.all(
      page.items.map(async (membership) => {
        const user = await this.getCurrentUserUseCase.execute({ userId: membership.userId });

        return {
          ...toMembershipSummary(membership),
          user: { id: user.id, email: user.email, displayName: user.displayName },
        };
      }),
    );

    return { items, nextCursor: page.nextCursor };
  }
}
