import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientAccountArchivedError, ClientPermission, GetClientAccountUseCase } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { BUYER_REPOSITORY, BuyerNotFoundError, type BuyerRepository } from "../../../tenders";
import { OpportunityPermission } from "../../domain/opportunity-permission";
import { parseOpportunitySource } from "../../domain/opportunity-source";
import { Opportunity } from "../../domain/opportunity.aggregate";
import { OpportunityId } from "../../domain/opportunity-id.value-object";
import { toOpportunitySummary, type OpportunitySummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { OPPORTUNITY_REPOSITORY, type OpportunityRepository } from "../ports/opportunity.repository";
import { assertHasOpportunityPermission } from "../policies/opportunity-authorization.policy";

export type CreateOpportunityCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  clientAccountId?: string | undefined;
  buyerId?: string | undefined;
  title: string;
  description?: string | undefined;
  source?: string | undefined;
  externalReference?: string | undefined;
  buyerName?: string | undefined;
  sector?: string | undefined;
  cpvCode?: string | undefined;
  location?: string | undefined;
  geographicZone?: string | undefined;
  publicationDate?: string | undefined;
  submissionDeadline?: string | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
  procedureType?: string | undefined;
  requestId?: string | undefined;
}>;

/** Mission §4 — `clientAccountId`/`buyerId` restent nullables à la création (une Opportunity peut
 *  exister sans candidat ni acheteur résolus). Un `clientAccountId` FOURNI doit exister,
 *  appartenir à l'organisation, ne pas être archivé, et l'acteur doit y avoir accès en écriture —
 *  jamais fait confiance directement (même motif que `CreateTenderUseCase`). */
@Injectable()
export class CreateOpportunityUseCase {
  constructor(
    @Inject(OPPORTUNITY_REPOSITORY) private readonly repository: OpportunityRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(BUYER_REPOSITORY) private readonly buyerRepository: BuyerRepository,
  ) {}

  async execute(command: CreateOpportunityCommand): Promise<OpportunitySummary> {
    assertHasOpportunityPermission(command.actorRole, OpportunityPermission.Create);

    if (command.clientAccountId !== undefined) {
      const client = await this.getClientAccountUseCase.execute({
        organizationId: command.organizationId,
        clientAccountId: command.clientAccountId,
        actorId: command.actorId,
        actorRole: command.actorRole,
      });
      if (client.status === "ARCHIVED") {
        throw new ClientAccountArchivedError();
      }
      await this.assertClientAccessUseCase.execute({
        organizationId: command.organizationId,
        clientAccountId: command.clientAccountId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        permission: ClientPermission.ManageOpportunity,
      });
    }

    // Lecture SEULE du repository Buyer (jamais une écriture) — même motif que documenté dans
    // tenders/index.ts pour ai-suggestion-bridge : simple vérification d'existence/tenant.
    if (command.buyerId !== undefined) {
      const buyer = await this.buyerRepository.findById({ organizationId: command.organizationId, buyerId: command.buyerId });
      if (!buyer) {
        throw new BuyerNotFoundError();
      }
    }

    const occurredAt = this.clock.now();

    const opportunity = Opportunity.create({
      id: OpportunityId.from(this.idGenerator.generate()),
      organizationId: command.organizationId,
      clientAccountId: command.clientAccountId,
      buyerId: command.buyerId,
      title: command.title,
      description: command.description,
      source: command.source ? parseOpportunitySource(command.source) : undefined,
      externalReference: command.externalReference,
      buyerName: command.buyerName,
      sector: command.sector,
      cpvCode: command.cpvCode,
      location: command.location,
      geographicZone: command.geographicZone,
      publicationDate: command.publicationDate ? new Date(command.publicationDate) : undefined,
      submissionDeadline: command.submissionDeadline ? new Date(command.submissionDeadline) : undefined,
      estimatedAmount: command.estimatedAmount,
      currency: command.currency,
      procedureType: command.procedureType,
      createdBy: command.actorId,
      occurredAt,
    });

    await this.repository.save(opportunity);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "opportunity.created",
      resourceType: "opportunity",
      resourceId: opportunity.id.value,
      requestId: command.requestId,
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "OpportunityCreated",
          aggregateType: "Opportunity",
          aggregateId: opportunity.id.value,
          payload: { opportunityId: opportunity.id.value, clientAccountId: opportunity.clientAccountId },
          occurredAt,
        },
      ],
    });

    return toOpportunitySummary(opportunity);
  }
}
