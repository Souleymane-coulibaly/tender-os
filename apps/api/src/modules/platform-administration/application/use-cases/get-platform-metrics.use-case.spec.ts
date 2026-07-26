import { describe, expect, it, vi } from "vitest";
import type { CountUsersByStatusUseCase } from "../../../identity";
import type { CountOrganizationsByStatusUseCase } from "../../../organizations";
import { PlatformAdministrator } from "../../domain/platform-administrator.aggregate";
import { PlatformAdministratorId } from "../../domain/platform-administrator-id.value-object";
import { PlatformRole } from "../../domain/platform-role";
import { InMemoryPlatformAdministratorRepository } from "../../test-support/in-memory-platform-administrator.repository";
import { GetPlatformMetricsUseCase } from "./get-platform-metrics.use-case";

describe("GetPlatformMetricsUseCase", () => {
  it("composes counts from Organizations, Identity and its own repository", async () => {
    const countOrganizationsByStatusUseCase = {
      execute: vi.fn().mockResolvedValue({ TRIAL: 1, ACTIVE: 2, SUSPENDED: 0, CLOSED: 0 }),
    } as unknown as CountOrganizationsByStatusUseCase;
    const countUsersByStatusUseCase = {
      execute: vi.fn().mockResolvedValue({ INVITED: 0, ACTIVE: 5, SUSPENDED: 1, DEACTIVATED: 0 }),
    } as unknown as CountUsersByStatusUseCase;
    const platformAdministratorRepository = new InMemoryPlatformAdministratorRepository();
    await platformAdministratorRepository.seed(
      PlatformAdministrator.create({
        id: PlatformAdministratorId.from("pa-1"),
        userId: "user-1",
        role: PlatformRole.Owner,
        occurredAt: new Date(),
      }),
    );
    const useCase = new GetPlatformMetricsUseCase(
      countOrganizationsByStatusUseCase,
      countUsersByStatusUseCase,
      platformAdministratorRepository,
    );

    const result = await useCase.execute({ actorRole: PlatformRole.Support });

    expect(result.organizationsByStatus.ACTIVE).toBe(2);
    expect(result.usersByStatus.SUSPENDED).toBe(1);
    expect(result.platformAdministratorsByRole.PLATFORM_OWNER).toBe(1);
  });
});
