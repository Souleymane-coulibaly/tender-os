import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { Milestone, type MilestoneType } from "../../domain/milestone.entity";
import { TenderPermission } from "../../domain/tender-permission";
import { toMilestoneSummary, type MilestoneSummary } from "../dtos";
import { MILESTONE_REPOSITORY, type MilestoneRepository } from "../ports/milestone.repository";
import { TENDER_LOT_REPOSITORY, type TenderLotRepository } from "../ports/tender-lot.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertLotBelongsToTender, assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";

export type CreateMilestoneCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  title: string;
  description?: string | undefined;
  date: string;
  type: MilestoneType;
  responsibleUserId?: string | undefined;
  timezone?: string | undefined;
  lotId?: string | undefined;
  mandatory?: boolean | undefined;
}>;

@Injectable()
export class CreateMilestoneUseCase {
  constructor(
    @Inject(MILESTONE_REPOSITORY) private readonly milestoneRepository: MilestoneRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: CreateMilestoneCommand): Promise<MilestoneSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);
    await assertLotBelongsToTender(this.lotRepository, command);

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
      timezone: command.timezone,
      lotId: command.lotId,
      mandatory: command.mandatory,
      occurredAt: now,
    });

    await this.milestoneRepository.save(milestone);

    return toMilestoneSummary(milestone, now);
  }
}
