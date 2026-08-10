import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import type { PricingScheduleLine } from "../../domain/pricing-schedule-line.entity";
import { assertPricingScheduleAccess } from "../policies/pricing-schedule-access.policy";
import { PricingScheduleAccessService } from "../services/pricing-schedule-access.service";
import { PricingScheduleLineEditGuard } from "../services/pricing-schedule-line-edit-guard.service";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { PRICING_SCHEDULE_LINE_REPOSITORY, type PricingScheduleLineRepository } from "../ports/pricing-schedule-line.repository";

export type SetPricingScheduleLineUnitPriceCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  pricingScheduleId: string;
  pricingScheduleLineId: string;
  /** Mode simple (mission §25) — toujours disponible sans forcer le mode avancé. Une chaîne
   *  décimale, jamais un `number` (mission "jamais Number(...) pour un montant financier"). */
  unitPrice: string;
  requestId?: string | undefined;
}>;

/**
 * Saisie de prix SIMPLE (mission §25) — la SEULE façon de fixer `proposedUnitPrice`/`proposedTotal`
 * (mission §27/§28 "l'IA ne choisit jamais le prix final") : même en mode avancé, un détail de coût
 * (`SetPricingScheduleLineCostBreakdownUseCase`) n'écrit jamais directement le prix, il reste
 * purement informatif — c'est TOUJOURS cette action explicite qui fixe le prix réel.
 */
@Injectable()
export class SetPricingScheduleLineUnitPriceUseCase {
  constructor(
    @Inject(PRICING_SCHEDULE_LINE_REPOSITORY) private readonly lineRepository: PricingScheduleLineRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly accessService: PricingScheduleAccessService,
    private readonly editGuard: PricingScheduleLineEditGuard,
  ) {}

  async execute(command: SetPricingScheduleLineUnitPriceCommand): Promise<PricingScheduleLine> {
    await assertPricingScheduleAccess(this.accessService, {
      organizationId: command.organizationId,
      pricingScheduleId: command.pricingScheduleId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.ManagePricingSchedule,
      requireUseOrgPermission: true,
    });

    const { line } = await this.editGuard.loadEditableLine({
      organizationId: command.organizationId,
      pricingScheduleId: command.pricingScheduleId,
      pricingScheduleLineId: command.pricingScheduleLineId,
    });

    const occurredAt = this.clock.now();
    line.setUnitPrice({ unitPrice: command.unitPrice, occurredAt });
    await this.lineRepository.save(line);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "pricing_schedule_line.priced",
      resourceType: "pricing_schedule_line",
      resourceId: line.id,
      requestId: command.requestId,
      metadata: { pricingScheduleId: command.pricingScheduleId, proposedUnitPrice: line.proposedUnitPrice, proposedTotal: line.proposedTotal },
    });

    return line;
  }
}
