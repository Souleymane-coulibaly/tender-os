import { Inject, Injectable } from "@nestjs/common";
import { assertHasCapability, PlatformCapability, type PlatformRole } from "../../../platform-administration";
import { ENTITLEMENT_OVERRIDE_REPOSITORY, type EntitlementOverridePage, type EntitlementOverrideRepository } from "../ports/entitlement-override.repository";

export type ListEntitlementOverridesQuery = Readonly<{
  organizationId: string;
  cursor?: string | undefined;
  limit: number;
  actorPlatformRole: PlatformRole;
}>;

const MAX_PAGE_SIZE = 50;

@Injectable()
export class ListEntitlementOverridesUseCase {
  constructor(@Inject(ENTITLEMENT_OVERRIDE_REPOSITORY) private readonly overrideRepository: EntitlementOverrideRepository) {}

  async execute(query: ListEntitlementOverridesQuery): Promise<EntitlementOverridePage> {
    assertHasCapability(query.actorPlatformRole, PlatformCapability.EntitlementOverridesRead);
    const limit = Math.min(query.limit, MAX_PAGE_SIZE);
    return this.overrideRepository.list(query.organizationId, { cursor: query.cursor, limit });
  }
}
