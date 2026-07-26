import { Injectable } from "@nestjs/common";
import { CountActiveMembersUseCase } from "../../../memberships";
import { GetOrganizationUseCase } from "../../../organizations";
import { PlatformCapability } from "../../domain/platform-capability";
import type { PlatformRole } from "../../domain/platform-role";
import { assertHasCapability } from "../policies/platform-authorization.policy";
import type { PlatformOrganizationView } from "./list-platform-organizations.use-case";

export type GetPlatformOrganizationQuery = Readonly<{
  actorRole: PlatformRole;
  organizationId: string;
}>;

export type GetPlatformOrganizationResult = PlatformOrganizationView;

@Injectable()
export class GetPlatformOrganizationUseCase {
  constructor(
    private readonly getOrganizationUseCase: GetOrganizationUseCase,
    private readonly countActiveMembersUseCase: CountActiveMembersUseCase,
  ) {}

  async execute(query: GetPlatformOrganizationQuery): Promise<GetPlatformOrganizationResult> {
    assertHasCapability(query.actorRole, PlatformCapability.OrganizationsRead);

    const organization = await this.getOrganizationUseCase.execute({ id: query.organizationId });
    const activeMemberCount = await this.countActiveMembersUseCase.execute({
      organizationId: query.organizationId,
    });

    return { ...organization, activeMemberCount };
  }
}
