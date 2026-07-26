import { Inject, Injectable } from "@nestjs/common";
import { CountUsersByStatusUseCase } from "../../../identity";
import { CountOrganizationsByStatusUseCase } from "../../../organizations";
import { PlatformCapability } from "../../domain/platform-capability";
import type { PlatformRole } from "../../domain/platform-role";
import {
  PLATFORM_ADMINISTRATOR_REPOSITORY,
  type PlatformAdministratorRepository,
} from "../ports/platform-administrator.repository";
import { assertHasCapability } from "../policies/platform-authorization.policy";

export type GetPlatformMetricsQuery = Readonly<{ actorRole: PlatformRole }>;

export type GetPlatformMetricsResult = Readonly<{
  organizationsByStatus: Record<string, number>;
  usersByStatus: Record<string, number>;
  platformAdministratorsByRole: Record<string, number>;
}>;

/**
 * "Quelques indicateurs techniques simples déjà disponibles" — composés à partir des
 * comptages déjà exposés par Organizations/Identity, pas un moteur d'analytics.
 */
@Injectable()
export class GetPlatformMetricsUseCase {
  constructor(
    private readonly countOrganizationsByStatusUseCase: CountOrganizationsByStatusUseCase,
    private readonly countUsersByStatusUseCase: CountUsersByStatusUseCase,
    @Inject(PLATFORM_ADMINISTRATOR_REPOSITORY)
    private readonly platformAdministratorRepository: PlatformAdministratorRepository,
  ) {}

  async execute(query: GetPlatformMetricsQuery): Promise<GetPlatformMetricsResult> {
    assertHasCapability(query.actorRole, PlatformCapability.MetricsRead);

    const [organizationsByStatus, usersByStatus, platformAdministratorsByRole] = await Promise.all([
      this.countOrganizationsByStatusUseCase.execute(),
      this.countUsersByStatusUseCase.execute(),
      this.platformAdministratorRepository.countByRole(),
    ]);

    return { organizationsByStatus, usersByStatus, platformAdministratorsByRole };
  }
}
