import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { TenderPermission } from "../../domain/tender-permission";
import { toMilestoneSummary, type MilestoneSummary } from "../dtos";
import { MILESTONE_REPOSITORY, type MilestoneRepository } from "../ports/milestone.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type ListMilestonesQuery = Readonly<{ organizationId: string; tenderId: string; actorRole: string }>;

@Injectable()
export class ListMilestonesUseCase {
  constructor(
    @Inject(MILESTONE_REPOSITORY) private readonly milestoneRepository: MilestoneRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(query: ListMilestonesQuery): Promise<MilestoneSummary[]> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const now = this.clock.now();
    const milestones = await this.milestoneRepository.listByTender({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });

    return milestones
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((milestone) => toMilestoneSummary(milestone, now));
  }
}
