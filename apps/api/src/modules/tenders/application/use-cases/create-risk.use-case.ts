import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { Risk, type RiskCategory, type RiskLevel, type RiskSeverity } from "../../domain/risk.entity";
import { TenderPermission } from "../../domain/tender-permission";
import { toRiskSummary, type RiskSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { RISK_REPOSITORY, type RiskRepository } from "../ports/risk.repository";
import { TENDER_LOT_REPOSITORY, type TenderLotRepository } from "../ports/tender-lot.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertLotBelongsToTender, assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";

export type CreateRiskCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  title: string;
  description?: string | undefined;
  severity: RiskSeverity;
  source?: string | undefined;
  assignedTo?: string | undefined;
  category?: RiskCategory | undefined;
  probability?: RiskLevel | undefined;
  impact?: RiskLevel | undefined;
  lotId?: string | undefined;
  requestId?: string | undefined;
}>;

@Injectable()
export class CreateRiskUseCase {
  constructor(
    @Inject(RISK_REPOSITORY) private readonly riskRepository: RiskRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: CreateRiskCommand): Promise<RiskSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageRisks);

    await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);
    await assertLotBelongsToTender(this.lotRepository, command);

    const risk = Risk.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      title: command.title,
      description: command.description,
      severity: command.severity,
      source: command.source,
      assignedTo: command.assignedTo,
      category: command.category,
      probability: command.probability,
      impact: command.impact,
      lotId: command.lotId,
      occurredAt: this.clock.now(),
    });

    await this.riskRepository.save(risk);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.risk_created",
      resourceType: "tender_risk",
      resourceId: risk.id,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId, severity: risk.severity },
    });

    return toRiskSummary(risk);
  }
}
