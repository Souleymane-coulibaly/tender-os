import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ENTITLEMENT_SERVICE, type EntitlementService } from "../../../billing";
import { ClientPermission } from "../../../client-portfolio";
import type { PricingScheduleLine } from "../../domain/pricing-schedule-line.entity";
import { assertPricingScheduleAccess } from "../policies/pricing-schedule-access.policy";
import { PricingScheduleAccessService } from "../services/pricing-schedule-access.service";
import { PricingScheduleLineEditGuard } from "../services/pricing-schedule-line-edit-guard.service";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { PRICING_SCHEDULE_LINE_REPOSITORY, type PricingScheduleLineRepository } from "../ports/pricing-schedule-line.repository";

export type SetPricingScheduleLineCommentCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  pricingScheduleId: string;
  pricingScheduleLineId: string;
  candidateComment: string | undefined;
  requestId?: string | undefined;
}>;

/** Commentaire candidat — éditable indépendamment du type de ligne (mission catalogue champ
 *  éditable/lecture-seule), jamais soumis à `NonPriceableLineError` (voir `PricingScheduleLine.
 *  setCandidateComment`, sans garde de `kind`). */
@Injectable()
export class SetPricingScheduleLineCommentUseCase {
  constructor(
    @Inject(PRICING_SCHEDULE_LINE_REPOSITORY) private readonly lineRepository: PricingScheduleLineRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly accessService: PricingScheduleAccessService,
    private readonly editGuard: PricingScheduleLineEditGuard,
    @Inject(ENTITLEMENT_SERVICE) private readonly entitlementService: EntitlementService,
  ) {}

  async execute(command: SetPricingScheduleLineCommentCommand): Promise<PricingScheduleLine> {
    const schedule = await assertPricingScheduleAccess(this.accessService, {
      organizationId: command.organizationId,
      pricingScheduleId: command.pricingScheduleId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.ManagePricingSchedule,
      requireUseOrgPermission: true,
    });

    // Checkpoint TENDEROS-2.1-P2.3-E1.4, mission §2/§3 (P1 Codex).
    return this.entitlementService.runTenderOperationEntitled(
      { organizationId: command.organizationId, tenderId: schedule.tenderId, actorId: command.actorId, occurredAt: this.clock.now() },
      async () => this.executeEntitled(command),
    );
  }

  private async executeEntitled(command: SetPricingScheduleLineCommentCommand): Promise<PricingScheduleLine> {
    const { line } = await this.editGuard.loadEditableLine({
      organizationId: command.organizationId,
      pricingScheduleId: command.pricingScheduleId,
      pricingScheduleLineId: command.pricingScheduleLineId,
    });

    const occurredAt = this.clock.now();
    line.setCandidateComment({ candidateComment: command.candidateComment, occurredAt });
    await this.lineRepository.save(line);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "pricing_schedule_line.comment_updated",
      resourceType: "pricing_schedule_line",
      resourceId: line.id,
      requestId: command.requestId,
      metadata: { pricingScheduleId: command.pricingScheduleId },
    });

    return line;
  }
}
