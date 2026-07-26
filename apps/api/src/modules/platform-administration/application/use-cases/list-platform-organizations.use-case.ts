import { Injectable } from "@nestjs/common";
import {
  CountActiveMembersUseCase,
} from "../../../memberships";
import { ListOrganizationsUseCase, OrganizationStatus, type OrganizationSummary } from "../../../organizations";
import { PlatformCapability } from "../../domain/platform-capability";
import type { PlatformRole } from "../../domain/platform-role";
import { assertHasCapability } from "../policies/platform-authorization.policy";

export type ListPlatformOrganizationsQuery = Readonly<{
  actorRole: PlatformRole;
  cursor?: string | undefined;
  limit: number;
  status?: OrganizationStatus | undefined;
}>;

export type PlatformOrganizationView = OrganizationSummary & { activeMemberCount: number };

export type ListPlatformOrganizationsResult = Readonly<{
  items: PlatformOrganizationView[];
  nextCursor: string | null;
}>;

@Injectable()
export class ListPlatformOrganizationsUseCase {
  constructor(
    private readonly listOrganizationsUseCase: ListOrganizationsUseCase,
    private readonly countActiveMembersUseCase: CountActiveMembersUseCase,
  ) {}

  async execute(query: ListPlatformOrganizationsQuery): Promise<ListPlatformOrganizationsResult> {
    assertHasCapability(query.actorRole, PlatformCapability.OrganizationsRead);

    const page = await this.listOrganizationsUseCase.execute({
      cursor: query.cursor,
      limit: query.limit,
      status: query.status,
    });

    const items = await Promise.all(
      page.items.map(async (organization) => ({
        ...organization,
        activeMemberCount: await this.countActiveMembersUseCase.execute({ organizationId: organization.id }),
      })),
    );

    return { items, nextCursor: page.nextCursor };
  }
}
