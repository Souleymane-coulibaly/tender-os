import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ENTITLEMENT_SERVICE, type EntitlementService } from "../../../billing";
import { ClientPermission } from "../../../client-portfolio";
import type { PricingScheduleLine, PricingScheduleLineCostBreakdown } from "../../domain/pricing-schedule-line.entity";
import { assertPricingScheduleAccess } from "../policies/pricing-schedule-access.policy";
import { PricingScheduleAccessService } from "../services/pricing-schedule-access.service";
import { PricingScheduleLineEditGuard } from "../services/pricing-schedule-line-edit-guard.service";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { PRICING_SCHEDULE_LINE_REPOSITORY, type PricingScheduleLineRepository } from "../ports/pricing-schedule-line.repository";

export type SetPricingScheduleLineCostBreakdownCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  pricingScheduleId: string;
  pricingScheduleLineId: string;
  costBreakdown: PricingScheduleLineCostBreakdown | undefined;
  requestId?: string | undefined;
}>;

/**
 * Mode AVANCÉ optionnel (mission §26) — main d'œuvre/matériel/équipement/sous-traitance/frais/marge,
 * purement INFORMATIF (mission §27/§28) : n'écrit jamais `proposedUnitPrice`/`proposedTotal`
 * lui-même, jamais un ERP comptable complet. Fixer le prix réel reste TOUJOURS un appel explicite et
 * séparé à `SetPricingScheduleLineUnitPriceUseCase`, potentiellement avec une valeur que le frontend
 * a calculée à partir de ce détail — jamais automatique côté serveur.
 */
@Injectable()
export class SetPricingScheduleLineCostBreakdownUseCase {
  constructor(
    @Inject(PRICING_SCHEDULE_LINE_REPOSITORY) private readonly lineRepository: PricingScheduleLineRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly accessService: PricingScheduleAccessService,
    private readonly editGuard: PricingScheduleLineEditGuard,
    @Inject(ENTITLEMENT_SERVICE) private readonly entitlementService: EntitlementService,
  ) {}

  async execute(command: SetPricingScheduleLineCostBreakdownCommand): Promise<PricingScheduleLine> {
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

  private async executeEntitled(command: SetPricingScheduleLineCostBreakdownCommand): Promise<PricingScheduleLine> {
    const { line } = await this.editGuard.loadEditableLine({
      organizationId: command.organizationId,
      pricingScheduleId: command.pricingScheduleId,
      pricingScheduleLineId: command.pricingScheduleLineId,
    });

    const occurredAt = this.clock.now();
    line.setCostBreakdown({ costBreakdown: command.costBreakdown, occurredAt });
    await this.lineRepository.save(line);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "pricing_schedule_line.cost_breakdown_updated",
      resourceType: "pricing_schedule_line",
      resourceId: line.id,
      requestId: command.requestId,
      metadata: { pricingScheduleId: command.pricingScheduleId },
    });

    return line;
  }
}
