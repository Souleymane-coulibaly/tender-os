import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { Milestone, type MilestoneType } from "../../domain/milestone.entity";
import { TenderPermission } from "../../domain/tender-permission";
import { toMilestoneSummary, type MilestoneSummary } from "../dtos";
import { MILESTONE_REPOSITORY, type MilestoneRepository } from "../ports/milestone.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type CreateMilestoneCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorRole: string;
  title: string;
  description?: string | undefined;
  date: string;
  type: MilestoneType;
  responsibleUserId?: string | undefined;
}>;

@Injectable()
export class CreateMilestoneUseCase {
  constructor(
    @Inject(MILESTONE_REPOSITORY) private readonly milestoneRepository: MilestoneRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateMilestoneCommand): Promise<MilestoneSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    const now = this.clock.now();

    const milestone = Milestone.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      title: command.title,
      description: command.description,
      date: new Date(command.date),
      type: command.type,
      responsibleUserId: command.responsibleUserId,
      occurredAt: now,
    });

    await this.milestoneRepository.save(milestone);

    return toMilestoneSummary(milestone, now);
  }
}
