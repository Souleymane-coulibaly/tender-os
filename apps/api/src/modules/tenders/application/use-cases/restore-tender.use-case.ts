import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { TenderPermission } from "../../domain/tender-permission";
import { TenderStatus } from "../../domain/tender-status";
import { toTenderSummary, type TenderSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { TENDER_STATUS_HISTORY_REPOSITORY, type TenderStatusHistoryRepository } from "../ports/tender-status-history.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";

export type RestoreTenderCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  reason?: string | undefined;
  requestId?: string | undefined;
}>;

export type RestoreTenderResult = TenderSummary;

/**
 * V2 Sprint 3 §7/§17/§29 — correctif : avant ce sprint, ARCHIVED était un état terminal sans
 * aucune transition sortante (`ALLOWED_TENDER_TRANSITIONS[ARCHIVED] = []`), rendant un Tender
 * archivé irrécupérable — jamais prévu par la mission. Restaure toujours vers DRAFT (jamais l'état
 * précédent l'archivage, non conservé), même permission que l'archivage (`TenderPermission.Archive`,
 * aucune permission dédiée distincte n'étant justifiée pour l'opération inverse — même précédent
 * que `ClientAccount`/`SubcontractorProfile`).
 */
@Injectable()
export class RestoreTenderUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(TENDER_STATUS_HISTORY_REPOSITORY) private readonly statusHistoryRepository: TenderStatusHistoryRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: RestoreTenderCommand): Promise<RestoreTenderResult> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Archive);

    const tender = await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    const previousStatus = tender.status;
    const occurredAt = this.clock.now();

    tender.changeStatus(TenderStatus.Draft, occurredAt);

    await this.tenderRepository.save(tender);

    await this.statusHistoryRepository.append({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      previousStatus,
      newStatus: TenderStatus.Draft,
      reason: command.reason,
      changedBy: command.actorId,
      occurredAt,
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.restored",
      resourceType: "tender",
      resourceId: tender.id.value,
      requestId: command.requestId,
    });

    return toTenderSummary(tender);
  }
}
