import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { AlertNotFoundError } from "../../domain/errors";
import { TenderPermission } from "../../domain/tender-permission";
import { toAlertSummary, type AlertSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ALERT_REPOSITORY, type AlertRepository } from "../ports/alert.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";

export type ResolveAlertCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  alertId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

@Injectable()
export class ResolveAlertUseCase {
  constructor(
    @Inject(ALERT_REPOSITORY) private readonly alertRepository: AlertRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: ResolveAlertCommand): Promise<AlertSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageAlerts);

    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    const alert = await this.alertRepository.findById({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      alertId: command.alertId,
    });

    if (!alert) {
      throw new AlertNotFoundError();
    }

    alert.resolve(command.actorId, this.clock.now());

    await this.alertRepository.save(alert);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.alert_resolved",
      resourceType: "tender_alert",
      resourceId: alert.id,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId },
    });

    return toAlertSummary(alert);
  }
}
