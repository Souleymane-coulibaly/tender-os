import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { Alert, type AlertSeverity } from "../../domain/alert.entity";
import { TenderPermission } from "../../domain/tender-permission";
import { toAlertSummary, type AlertSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ALERT_REPOSITORY, type AlertRepository } from "../ports/alert.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type CreateAlertCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  type: string;
  severity: AlertSeverity;
  message: string;
  source?: string | undefined;
  requestId?: string | undefined;
}>;

@Injectable()
export class CreateAlertUseCase {
  constructor(
    @Inject(ALERT_REPOSITORY) private readonly alertRepository: AlertRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateAlertCommand): Promise<AlertSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageAlerts);

    const alert = Alert.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      type: command.type,
      severity: command.severity,
      message: command.message,
      source: command.source,
      occurredAt: this.clock.now(),
    });

    await this.alertRepository.save(alert);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.alert_created",
      resourceType: "tender_alert",
      resourceId: alert.id,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId, severity: alert.severity, type: alert.type },
    });

    return toAlertSummary(alert);
  }
}
