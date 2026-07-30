import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { AwardCriterion } from "../../domain/award-criterion.entity";
import { TenderPermission } from "../../domain/tender-permission";
import { toAwardCriterionSummary, type AwardCriterionSummary } from "../dtos";
import {
  AWARD_CRITERION_REPOSITORY,
  type AwardCriterionRepository,
} from "../ports/award-criterion.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";

export type CreateAwardCriterionCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  name: string;
  description?: string | undefined;
  weight: string;
  parentCriterionId?: string | undefined;
  displayOrder?: number | undefined;
}>;

@Injectable()
export class CreateAwardCriterionUseCase {
  constructor(
    @Inject(AWARD_CRITERION_REPOSITORY) private readonly criterionRepository: AwardCriterionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: CreateAwardCriterionCommand): Promise<AwardCriterionSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    const criterion = AwardCriterion.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      name: command.name,
      description: command.description,
      weight: command.weight,
      parentCriterionId: command.parentCriterionId,
      displayOrder: command.displayOrder,
      occurredAt: this.clock.now(),
    });

    await this.criterionRepository.save(criterion);

    return toAwardCriterionSummary(criterion);
  }
}
