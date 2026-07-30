import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { ChecklistItem } from "../../domain/checklist-item.entity";
import { TenderPermission } from "../../domain/tender-permission";
import { toChecklistItemSummary, type ChecklistItemSummary } from "../dtos";
import {
  CHECKLIST_ITEM_REPOSITORY,
  type ChecklistItemRepository,
} from "../ports/checklist-item.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";

export type CreateChecklistItemCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  title: string;
  description?: string | undefined;
  required?: boolean | undefined;
  assignedTo?: string | undefined;
  dueDate?: string | undefined;
  displayOrder?: number | undefined;
}>;

@Injectable()
export class CreateChecklistItemUseCase {
  constructor(
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: CreateChecklistItemCommand): Promise<ChecklistItemSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageChecklist);

    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    const item = ChecklistItem.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      title: command.title,
      description: command.description,
      required: command.required,
      assignedTo: command.assignedTo,
      dueDate: command.dueDate ? new Date(command.dueDate) : undefined,
      displayOrder: command.displayOrder,
      occurredAt: this.clock.now(),
    });

    await this.checklistRepository.save(item);

    return toChecklistItemSummary(item);
  }
}
