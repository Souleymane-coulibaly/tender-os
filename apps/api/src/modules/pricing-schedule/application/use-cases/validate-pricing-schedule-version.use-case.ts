import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { computePricingControls } from "../../domain/services/compute-pricing-controls";
import { PricingScheduleValidationBlockedError, PricingScheduleVersionNotFoundError } from "../../domain/errors";
import type { PricingScheduleVersion } from "../../domain/pricing-schedule-version.entity";
import { assertPricingScheduleAccess } from "../policies/pricing-schedule-access.policy";
import { PricingScheduleAccessService } from "../services/pricing-schedule-access.service";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { PRICING_SCHEDULE_LINE_REPOSITORY, type PricingScheduleLineRepository } from "../ports/pricing-schedule-line.repository";
import { PRICING_SCHEDULE_REPOSITORY, type PricingScheduleRepository } from "../ports/pricing-schedule.repository";
import { PRICING_SCHEDULE_VERSION_REPOSITORY, type PricingScheduleVersionRepository } from "../ports/pricing-schedule-version.repository";

export type ValidatePricingScheduleVersionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  pricingScheduleId: string;
  pricingScheduleVersionId: string;
  /** Mission — un blocage (contrôle ERROR) ne peut être outrepassé qu'avec une justification
   *  EXPLICITE, jamais silencieusement. Absent : les erreurs bloquent strictement. */
  overrideJustification?: string | undefined;
  requestId?: string | undefined;
}>;

/**
 * Validation humaine explicite (mission §44/§45) — fige DÉFINITIVEMENT la version (jamais un retour
 * en arrière possible depuis cet état, voir `PricingScheduleVersion.validate` qui refuse toute
 * mutation ultérieure). Les contrôles ERROR bloquent la validation par défaut (mission "montrer les
 * anomalies avant de confirmer") ; un contournement exige une justification explicite ET produit une
 * entrée d'audit dédiée (`pricing_schedule.validation_overridden`), en plus de l'audit de validation
 * normal — jamais un contournement silencieux.
 */
@Injectable()
export class ValidatePricingScheduleVersionUseCase {
  constructor(
    @Inject(PRICING_SCHEDULE_REPOSITORY) private readonly scheduleRepository: PricingScheduleRepository,
    @Inject(PRICING_SCHEDULE_VERSION_REPOSITORY) private readonly versionRepository: PricingScheduleVersionRepository,
    @Inject(PRICING_SCHEDULE_LINE_REPOSITORY) private readonly lineRepository: PricingScheduleLineRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly accessService: PricingScheduleAccessService,
  ) {}

  async execute(command: ValidatePricingScheduleVersionCommand): Promise<PricingScheduleVersion> {
    const schedule = await assertPricingScheduleAccess(this.accessService, {
      organizationId: command.organizationId,
      pricingScheduleId: command.pricingScheduleId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.ValidatePricingSchedule,
      requireUseOrgPermission: true,
    });

    const version = await this.versionRepository.findById({ organizationId: command.organizationId, pricingScheduleVersionId: command.pricingScheduleVersionId });
    if (!version || version.pricingScheduleId !== schedule.id) {
      throw new PricingScheduleVersionNotFoundError();
    }

    const lines = await this.lineRepository.listByVersion({ organizationId: command.organizationId, pricingScheduleVersionId: version.id });
    const controls = computePricingControls(lines);

    let overridden = false;
    if (controls.errorCount > 0) {
      if (!command.overrideJustification?.trim()) {
        throw new PricingScheduleValidationBlockedError(`${controls.errorCount} blocking control(s) unresolved (e.g. missing unit price, incoherent total).`);
      }
      overridden = true;
    }

    const occurredAt = this.clock.now();
    version.validate({ validatedBy: command.actorId, occurredAt });
    schedule.markValidated(occurredAt);

    await this.atomicTransactionRunner.run(async () => {
      await this.versionRepository.save(version);
      await this.scheduleRepository.save(schedule);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "pricing_schedule.validated",
        resourceType: "pricing_schedule_version",
        resourceId: version.id,
        requestId: command.requestId,
        metadata: { pricingScheduleId: schedule.id, versionNumber: version.versionNumber, errorCount: controls.errorCount, warningCount: controls.warningCount, overridden },
      });

      if (overridden) {
        await this.auditLogWriter.record({
          organizationId: command.organizationId,
          actorType: "USER",
          actorId: command.actorId,
          action: "pricing_schedule.validation_overridden",
          resourceType: "pricing_schedule_version",
          resourceId: version.id,
          requestId: command.requestId,
          metadata: { pricingScheduleId: schedule.id, versionNumber: version.versionNumber, errorCount: controls.errorCount, justification: command.overrideJustification },
        });
      }
    });

    return version;
  }
}
