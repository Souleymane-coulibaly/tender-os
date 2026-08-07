import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { assertHasTenderPermission, GetTenderUseCase, TenderPermission } from "../../../tenders";
import { GoNoGoAdminBypassJustificationRequiredError, GoNoGoReportNotFoundError } from "../../domain/errors";
import { assertValidGoNoGoDecisionInput, GoNoGoDecisionLevel, parseGoNoGoDecisionValue } from "../../domain/go-no-go-decision";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { GO_NO_GO_DECISION_REPOSITORY, type GoNoGoDecisionRecord, type GoNoGoDecisionRepository } from "../ports/go-no-go-decision.repository";
import { GO_NO_GO_REPORT_REPOSITORY, type GoNoGoReportRepository } from "../ports/go-no-go-report.repository";
import { resolveGoNoGoClientAccess } from "../policies/go-no-go-client-access.policy";

export type RecordTenderGoNoGoDecisionCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  decision: string;
  justification?: string | undefined;
  conditions?: string | undefined;
  comment?: string | undefined;
  linkedReportId?: string | undefined;
  requestId?: string | undefined;
}>;

/**
 * Décision humaine Niveau TENDER (mission §18) — NE TOUCHE JAMAIS `Tender.status` (contrairement au
 * Niveau OPPORTUNITY) : le funnel de statut Tenders reste entièrement piloté par le module Tenders
 * lui-même, jamais par une décision GO/NO-GO (mission §18, "jamais un second pilotage du statut
 * Tender"). Toujours une NOUVELLE ligne append-only (mission §29).
 */
@Injectable()
export class RecordTenderGoNoGoDecisionUseCase {
  constructor(
    @Inject(GO_NO_GO_DECISION_REPOSITORY) private readonly decisionRepository: GoNoGoDecisionRepository,
    @Inject(GO_NO_GO_REPORT_REPOSITORY) private readonly reportRepository: GoNoGoReportRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: RecordTenderGoNoGoDecisionCommand): Promise<GoNoGoDecisionRecord> {
    assertHasTenderPermission(command.actorRole, TenderPermission.RecordGoNoGoDecision);

    const tender = await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorRole: command.actorRole,
    });

    const { viaAdminBypass } = await resolveGoNoGoClientAccess({
      assertClientAccessUseCase: this.assertClientAccessUseCase,
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.RecordGoNoGoDecision,
    });
    // Voir `record-opportunity-go-no-go-decision.use-case.ts` — même règle : le contournement
    // administratif exige toujours une justification explicite, quelle que soit la décision.
    if (viaAdminBypass && !command.justification?.trim()) {
      throw new GoNoGoAdminBypassJustificationRequiredError();
    }

    const decision = parseGoNoGoDecisionValue(command.decision);
    assertValidGoNoGoDecisionInput({ decision, justification: command.justification, conditions: command.conditions });

    if (command.linkedReportId !== undefined) {
      const report = await this.reportRepository.findById({ organizationId: command.organizationId, tenderId: command.tenderId, reportId: command.linkedReportId });
      if (!report) {
        throw new GoNoGoReportNotFoundError();
      }
    }

    const occurredAt = this.clock.now();

    const record = await this.decisionRepository.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      level: GoNoGoDecisionLevel.Tender,
      tenderId: command.tenderId,
      linkedReportId: command.linkedReportId,
      decision,
      justification: command.justification,
      conditions: command.conditions,
      comment: command.comment,
      actorId: command.actorId,
      decidedAt: occurredAt,
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.go_no_go_decision_recorded",
      resourceType: "tender",
      resourceId: command.tenderId,
      requestId: command.requestId,
      metadata: viaAdminBypass ? { clientAssignmentBypass: true } : undefined,
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "GoNoGoDecisionRecorded",
          aggregateType: "Tender",
          aggregateId: command.tenderId,
          payload: { tenderId: command.tenderId, level: GoNoGoDecisionLevel.Tender, decision },
          occurredAt,
        },
      ],
    });

    return record;
  }
}
