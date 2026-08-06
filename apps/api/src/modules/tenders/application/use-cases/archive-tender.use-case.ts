import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { TenderPermission } from "../../domain/tender-permission";
import { TenderStatus } from "../../domain/tender-status";
import { toTenderSummary, type TenderSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import {
  TENDER_STATUS_HISTORY_REPOSITORY,
  type TenderStatusHistoryRepository,
} from "../ports/tender-status-history.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";

export type ArchiveTenderCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  reason?: string | undefined;
  requestId?: string | undefined;
}>;

export type ArchiveTenderResult = TenderSummary;

@Injectable()
export class ArchiveTenderUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(TENDER_STATUS_HISTORY_REPOSITORY)
    private readonly statusHistoryRepository: TenderStatusHistoryRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: ArchiveTenderCommand): Promise<ArchiveTenderResult> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Archive);

    const tender = await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    const previousStatus = tender.status;
    const occurredAt = this.clock.now();

    tender.changeStatus(TenderStatus.Archived, occurredAt);

    await this.tenderRepository.save(tender);

    await this.statusHistoryRepository.append({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      previousStatus,
      newStatus: TenderStatus.Archived,
      reason: command.reason,
      changedBy: command.actorId,
      occurredAt,
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.archived",
      resourceType: "tender",
      resourceId: tender.id.value,
      requestId: command.requestId,
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "TenderArchived",
          aggregateType: "Tender",
          aggregateId: tender.id.value,
          payload: { tenderId: tender.id.value },
          occurredAt,
        },
      ],
    });

    return toTenderSummary(tender);
  }
}
