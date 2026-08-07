import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { OpportunityPermission } from "../../domain/opportunity-permission";
import { OpportunityStatus } from "../../domain/opportunity-status";
import { assertOpportunityFound } from "../../domain/opportunity.aggregate";
import { toOpportunitySummary, type OpportunitySummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { OPPORTUNITY_REPOSITORY, type OpportunityRepository } from "../ports/opportunity.repository";
import { assertHasOpportunityPermission } from "../policies/opportunity-authorization.policy";
import { assertOpportunityClientAccessAllowed } from "../policies/opportunity-client-access.policy";

export type RestoreOpportunityCommand = Readonly<{
  organizationId: string;
  opportunityId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/** Restauration ARCHIVED -> DRAFT (même motif que `RestoreTenderUseCase`) — jamais l'état
 *  précédent l'archivage, non conservé. */
@Injectable()
export class RestoreOpportunityUseCase {
  constructor(
    @Inject(OPPORTUNITY_REPOSITORY) private readonly repository: OpportunityRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: RestoreOpportunityCommand): Promise<OpportunitySummary> {
    assertHasOpportunityPermission(command.actorRole, OpportunityPermission.Archive);

    const opportunity = assertOpportunityFound(
      await this.repository.findById({ organizationId: command.organizationId, opportunityId: command.opportunityId }),
    );

    await assertOpportunityClientAccessAllowed(opportunity, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageOpportunity,
    });

    const occurredAt = this.clock.now();
    opportunity.changeStatus(OpportunityStatus.Draft, occurredAt);

    await this.repository.save(opportunity);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "opportunity.restored",
      resourceType: "opportunity",
      resourceId: opportunity.id.value,
      requestId: command.requestId,
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "OpportunityRestored",
          aggregateType: "Opportunity",
          aggregateId: opportunity.id.value,
          payload: { opportunityId: opportunity.id.value },
          occurredAt,
        },
      ],
    });

    return toOpportunitySummary(opportunity);
  }
}
