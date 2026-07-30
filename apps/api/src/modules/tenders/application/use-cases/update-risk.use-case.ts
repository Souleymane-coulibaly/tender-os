import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { RiskNotFoundError } from "../../domain/errors";
import type { RiskSeverity, RiskStatus } from "../../domain/risk.entity";
import { TenderPermission } from "../../domain/tender-permission";
import { toRiskSummary, type RiskSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { RISK_REPOSITORY, type RiskRepository } from "../ports/risk.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";

async function loadRisk(
  repository: RiskRepository,
  input: { organizationId: string; tenderId: string; riskId: string },
) {
  const risk = await repository.findById(input);
  if (!risk) {
    throw new RiskNotFoundError();
  }
  return risk;
}

export type UpdateRiskCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  riskId: string;
  actorId: string;
  actorRole: string;
  title?: string | undefined;
  description?: string | undefined;
  severity?: RiskSeverity | undefined;
  source?: string | undefined;
  mitigation?: string | undefined;
  assignedTo?: string | undefined;
}>;

@Injectable()
export class UpdateRiskUseCase {
  constructor(
    @Inject(RISK_REPOSITORY) private readonly riskRepository: RiskRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: UpdateRiskCommand): Promise<RiskSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageRisks);

    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    const risk = await loadRisk(this.riskRepository, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      riskId: command.riskId,
    });

    risk.update(
      {
        title: command.title,
        description: command.description,
        severity: command.severity,
        source: command.source,
        mitigation: command.mitigation,
        assignedTo: command.assignedTo,
      },
      this.clock.now(),
    );

    await this.riskRepository.save(risk);

    return toRiskSummary(risk);
  }
}

export type ChangeRiskStatusCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  riskId: string;
  actorId: string;
  actorRole: string;
  status: RiskStatus;
  requestId?: string | undefined;
}>;

@Injectable()
export class ChangeRiskStatusUseCase {
  constructor(
    @Inject(RISK_REPOSITORY) private readonly riskRepository: RiskRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: ChangeRiskStatusCommand): Promise<RiskSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageRisks);

    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    const risk = await loadRisk(this.riskRepository, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      riskId: command.riskId,
    });

    const previousStatus = risk.status;
    risk.changeStatus(command.status, this.clock.now());

    await this.riskRepository.save(risk);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.risk_status_changed",
      resourceType: "tender_risk",
      resourceId: risk.id,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId, previousStatus, newStatus: risk.status },
    });

    return toRiskSummary(risk);
  }
}
