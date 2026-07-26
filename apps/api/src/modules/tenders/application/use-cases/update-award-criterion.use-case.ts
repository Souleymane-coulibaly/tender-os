import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AwardCriterionNotFoundError } from "../../domain/errors";
import { TenderPermission } from "../../domain/tender-permission";
import { toAwardCriterionSummary, type AwardCriterionSummary } from "../dtos";
import {
  AWARD_CRITERION_REPOSITORY,
  type AwardCriterionRepository,
} from "../ports/award-criterion.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type UpdateAwardCriterionCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  criterionId: string;
  actorRole: string;
  name?: string | undefined;
  description?: string | undefined;
  weight?: string | undefined;
  displayOrder?: number | undefined;
}>;

@Injectable()
export class UpdateAwardCriterionUseCase {
  constructor(
    @Inject(AWARD_CRITERION_REPOSITORY) private readonly criterionRepository: AwardCriterionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateAwardCriterionCommand): Promise<AwardCriterionSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    const criterion = await this.criterionRepository.findById({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      criterionId: command.criterionId,
    });

    if (!criterion) {
      throw new AwardCriterionNotFoundError();
    }

    criterion.update(
      { name: command.name, description: command.description, weight: command.weight, displayOrder: command.displayOrder },
      this.clock.now(),
    );

    await this.criterionRepository.save(criterion);

    return toAwardCriterionSummary(criterion);
  }
}

export type DeleteAwardCriterionCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  criterionId: string;
  actorRole: string;
}>;

@Injectable()
export class DeleteAwardCriterionUseCase {
  constructor(
    @Inject(AWARD_CRITERION_REPOSITORY) private readonly criterionRepository: AwardCriterionRepository,
  ) {}

  async execute(command: DeleteAwardCriterionCommand): Promise<void> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    const criterion = await this.criterionRepository.findById({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      criterionId: command.criterionId,
    });

    if (!criterion) {
      throw new AwardCriterionNotFoundError();
    }

    await this.criterionRepository.delete({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      criterionId: command.criterionId,
    });
  }
}
