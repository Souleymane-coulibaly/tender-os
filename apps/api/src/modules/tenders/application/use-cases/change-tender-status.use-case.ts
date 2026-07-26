import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { TenderNotFoundError } from "../../domain/errors";
import { TenderPermission } from "../../domain/tender-permission";
import { parseTenderStatus } from "../../domain/tender-status";
import { toTenderSummary, type TenderSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import {
  TENDER_STATUS_HISTORY_REPOSITORY,
  type TenderStatusHistoryRepository,
} from "../ports/tender-status-history.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type ChangeTenderStatusCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  status: string;
  reason?: string | undefined;
  requestId?: string | undefined;
}>;

export type ChangeTenderStatusResult = TenderSummary;

@Injectable()
export class ChangeTenderStatusUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(TENDER_STATUS_HISTORY_REPOSITORY)
    private readonly statusHistoryRepository: TenderStatusHistoryRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ChangeTenderStatusCommand): Promise<ChangeTenderStatusResult> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    const tender = await this.tenderRepository.findById({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
    });

    if (!tender) {
      throw new TenderNotFoundError();
    }

    const previousStatus = tender.status;
    const nextStatus = parseTenderStatus(command.status);
    const occurredAt = this.clock.now();

    tender.changeStatus(nextStatus, occurredAt);

    await this.tenderRepository.save(tender);

    await this.statusHistoryRepository.append({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      previousStatus,
      newStatus: nextStatus,
      reason: command.reason,
      changedBy: command.actorId,
      occurredAt,
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.status_changed",
      resourceType: "tender",
      resourceId: tender.id.value,
      requestId: command.requestId,
      metadata: { previousStatus, newStatus: nextStatus },
    });

    return toTenderSummary(tender);
  }
}
