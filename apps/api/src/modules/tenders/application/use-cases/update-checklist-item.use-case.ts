import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { ChecklistItemNotFoundError } from "../../domain/errors";
import type { ChecklistItemStatus } from "../../domain/checklist-item.entity";
import { TenderPermission } from "../../domain/tender-permission";
import { toChecklistItemSummary, type ChecklistItemSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import {
  CHECKLIST_ITEM_REPOSITORY,
  type ChecklistItemRepository,
} from "../ports/checklist-item.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";

export type UpdateChecklistItemCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  itemId: string;
  actorId: string;
  actorRole: string;
  title?: string | undefined;
  description?: string | undefined;
  required?: boolean | undefined;
  assignedTo?: string | undefined;
  dueDate?: string | undefined;
  comment?: string | undefined;
  displayOrder?: number | undefined;
}>;

async function loadItem(
  repository: ChecklistItemRepository,
  input: { organizationId: string; tenderId: string; itemId: string },
) {
  const item = await repository.findById(input);
  if (!item) {
    throw new ChecklistItemNotFoundError();
  }
  return item;
}

@Injectable()
export class UpdateChecklistItemUseCase {
  constructor(
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: UpdateChecklistItemCommand): Promise<ChecklistItemSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageChecklist);

    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    const item = await loadItem(this.checklistRepository, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      itemId: command.itemId,
    });

    item.update(
      {
        title: command.title,
        description: command.description,
        required: command.required,
        assignedTo: command.assignedTo,
        dueDate: command.dueDate ? new Date(command.dueDate) : undefined,
        comment: command.comment,
        displayOrder: command.displayOrder,
      },
      this.clock.now(),
    );

    await this.checklistRepository.save(item);

    return toChecklistItemSummary(item);
  }
}

export type ChangeChecklistItemStatusCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  itemId: string;
  actorId: string;
  actorRole: string;
  status: ChecklistItemStatus;
  requestId?: string | undefined;
}>;

@Injectable()
export class ChangeChecklistItemStatusUseCase {
  constructor(
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: ChangeChecklistItemStatusCommand): Promise<ChecklistItemSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageChecklist);

    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    const item = await loadItem(this.checklistRepository, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      itemId: command.itemId,
    });

    const previousStatus = item.status;
    item.changeStatus(command.status, command.actorId, this.clock.now());

    await this.checklistRepository.save(item);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.checklist_item_status_changed",
      resourceType: "tender_checklist_item",
      resourceId: item.id,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId, previousStatus, newStatus: item.status },
    });

    return toChecklistItemSummary(item);
  }
}
