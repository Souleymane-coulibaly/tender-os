import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { InvalidOpportunityStatusTransitionError } from "../../domain/errors";
import { OpportunityPermission } from "../../domain/opportunity-permission";
import { OpportunityStatus, parseOpportunityStatus } from "../../domain/opportunity-status";
import { assertOpportunityFound } from "../../domain/opportunity.aggregate";
import { toOpportunitySummary, type OpportunitySummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { OPPORTUNITY_REPOSITORY, type OpportunityRepository } from "../ports/opportunity.repository";
import { assertHasOpportunityPermission } from "../policies/opportunity-authorization.policy";
import { assertOpportunityClientAccessAllowed } from "../policies/opportunity-client-access.policy";

/** Mouvements du FUNNEL AMONT uniquement (mission §5) — GO/GO_CONDITIONAL/NO_GO ne sont JAMAIS
 *  atteignables via ce use case (voir `opportunity-status.ts`), uniquement via
 *  `RecordOpportunityGoNoGoDecisionUseCase` ; PROMOTED uniquement via
 *  `PromoteOpportunityToTenderUseCase`. */
const ALLOWED_MANUAL_TRANSITIONS: readonly OpportunityStatus[] = [
  OpportunityStatus.Draft,
  OpportunityStatus.ToQualify,
  OpportunityStatus.Qualified,
  OpportunityStatus.Dismissed,
];

export type ChangeOpportunityStatusCommand = Readonly<{
  organizationId: string;
  opportunityId: string;
  actorId: string;
  actorRole: string;
  nextStatus: string;
  requestId?: string | undefined;
}>;

@Injectable()
export class ChangeOpportunityStatusUseCase {
  constructor(
    @Inject(OPPORTUNITY_REPOSITORY) private readonly repository: OpportunityRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: ChangeOpportunityStatusCommand): Promise<OpportunitySummary> {
    assertHasOpportunityPermission(command.actorRole, OpportunityPermission.Update);

    const nextStatus = parseOpportunityStatus(command.nextStatus);
    if (!ALLOWED_MANUAL_TRANSITIONS.includes(nextStatus)) {
      throw new InvalidOpportunityStatusTransitionError({ from: "*", to: nextStatus });
    }

    const opportunity = assertOpportunityFound(
      await this.repository.findById({ organizationId: command.organizationId, opportunityId: command.opportunityId }),
    );

    await assertOpportunityClientAccessAllowed(opportunity, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageOpportunity,
    });

    const previousStatus = opportunity.status;
    const occurredAt = this.clock.now();
    opportunity.changeStatus(nextStatus, occurredAt);

    await this.repository.save(opportunity);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "opportunity.status_changed",
      resourceType: "opportunity",
      resourceId: opportunity.id.value,
      requestId: command.requestId,
      metadata: { previousStatus, newStatus: nextStatus },
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "OpportunityStatusChanged",
          aggregateType: "Opportunity",
          aggregateId: opportunity.id.value,
          payload: { opportunityId: opportunity.id.value, previousStatus, newStatus: nextStatus },
          occurredAt,
        },
      ],
    });

    return toOpportunitySummary(opportunity);
  }
}
