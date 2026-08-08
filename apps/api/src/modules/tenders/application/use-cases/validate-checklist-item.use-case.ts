import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { TenderPermission } from "../../domain/tender-permission";
import { toChecklistItemSummary, type ChecklistItemSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CHECKLIST_ITEM_REPOSITORY, type ChecklistItemRepository } from "../ports/checklist-item.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";
import { loadChecklistItem } from "./update-checklist-item.use-case";

export type ValidateChecklistItemCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  itemId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/** V2 Sprint 6 §20-21 — décision humaine explicite : seule action (avec `markNotApplicable`) qui
 *  fait avancer le score de readiness (35%, `readiness-calculator.ts`), jamais un simple
 *  rapprochement documentaire non validé. */
@Injectable()
export class ValidateChecklistItemUseCase {
  constructor(
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: ValidateChecklistItemCommand): Promise<ChecklistItemSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageChecklist);
    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    const item = await loadChecklistItem(this.checklistRepository, command);
    const occurredAt = this.clock.now();
    item.validate(command.actorId, occurredAt);
    await this.checklistRepository.save(item);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.checklist_item_validated",
      resourceType: "tender_checklist_item",
      resourceId: item.id,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId },
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "ChecklistItemValidated",
          aggregateType: "TenderChecklistItem",
          aggregateId: item.id,
          payload: { tenderId: command.tenderId, itemId: item.id },
          occurredAt,
        },
      ],
    });

    return toChecklistItemSummary(item);
  }
}

export type MarkChecklistItemNotApplicableCommand = ValidateChecklistItemCommand;

@Injectable()
export class MarkChecklistItemNotApplicableUseCase {
  constructor(
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: MarkChecklistItemNotApplicableCommand): Promise<ChecklistItemSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageChecklist);
    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    const item = await loadChecklistItem(this.checklistRepository, command);
    const occurredAt = this.clock.now();
    item.markNotApplicable(command.actorId, occurredAt);
    await this.checklistRepository.save(item);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.checklist_item_marked_not_applicable",
      resourceType: "tender_checklist_item",
      resourceId: item.id,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId },
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "ChecklistItemMarkedNotApplicable",
          aggregateType: "TenderChecklistItem",
          aggregateId: item.id,
          payload: { tenderId: command.tenderId, itemId: item.id },
          occurredAt,
        },
      ],
    });

    return toChecklistItemSummary(item);
  }
}
