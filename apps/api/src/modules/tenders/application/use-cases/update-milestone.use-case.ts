import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { MilestoneNotFoundError } from "../../domain/errors";
import type { MilestoneType } from "../../domain/milestone.entity";
import { TenderPermission } from "../../domain/tender-permission";
import { toMilestoneSummary, type MilestoneSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { MILESTONE_REPOSITORY, type MilestoneRepository } from "../ports/milestone.repository";
import { TENDER_LOT_REPOSITORY, type TenderLotRepository } from "../ports/tender-lot.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertLotBelongsToTender, assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";

async function loadMilestone(
  repository: MilestoneRepository,
  input: { organizationId: string; tenderId: string; milestoneId: string },
) {
  const milestone = await repository.findById(input);
  if (!milestone) {
    throw new MilestoneNotFoundError();
  }
  return milestone;
}

export type UpdateMilestoneCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  milestoneId: string;
  actorId: string;
  actorRole: string;
  title?: string | undefined;
  description?: string | undefined;
  date?: string | undefined;
  type?: MilestoneType | undefined;
  responsibleUserId?: string | undefined;
  timezone?: string | undefined;
  lotId?: string | undefined;
  mandatory?: boolean | undefined;
  requestId?: string | undefined;
}>;

@Injectable()
export class UpdateMilestoneUseCase {
  constructor(
    @Inject(MILESTONE_REPOSITORY) private readonly milestoneRepository: MilestoneRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: UpdateMilestoneCommand): Promise<MilestoneSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);
    await assertLotBelongsToTender(this.lotRepository, command);

    const milestone = await loadMilestone(this.milestoneRepository, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      milestoneId: command.milestoneId,
    });

    const now = this.clock.now();
    const previousResponsibleUserId = milestone.responsibleUserId;

    milestone.update(
      {
        title: command.title,
        description: command.description,
        date: command.date ? new Date(command.date) : undefined,
        type: command.type,
        responsibleUserId: command.responsibleUserId,
        timezone: command.timezone,
        lotId: command.lotId,
        mandatory: command.mandatory,
      },
      now,
    );

    await this.milestoneRepository.save(milestone);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.milestone_updated",
      resourceType: "tender_milestone",
      resourceId: milestone.id,
      requestId: command.requestId,
      metadata: {
        tenderId: command.tenderId,
        previousResponsibleUserId,
        newResponsibleUserId: milestone.responsibleUserId,
      },
    });

    return toMilestoneSummary(milestone, now);
  }
}

export type MarkMilestoneDoneCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  milestoneId: string;
  actorId: string;
  actorRole: string;
}>;

@Injectable()
export class MarkMilestoneDoneUseCase {
  constructor(
    @Inject(MILESTONE_REPOSITORY) private readonly milestoneRepository: MilestoneRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: MarkMilestoneDoneCommand): Promise<MilestoneSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    const milestone = await loadMilestone(this.milestoneRepository, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      milestoneId: command.milestoneId,
    });

    const now = this.clock.now();
    milestone.markDone(now);

    await this.milestoneRepository.save(milestone);

    return toMilestoneSummary(milestone, now);
  }
}

export type DeleteMilestoneCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  milestoneId: string;
  actorId: string;
  actorRole: string;
}>;

@Injectable()
export class DeleteMilestoneUseCase {
  constructor(
    @Inject(MILESTONE_REPOSITORY) private readonly milestoneRepository: MilestoneRepository,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: DeleteMilestoneCommand): Promise<void> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    await loadMilestone(this.milestoneRepository, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      milestoneId: command.milestoneId,
    });

    await this.milestoneRepository.delete({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      milestoneId: command.milestoneId,
    });
  }
}
