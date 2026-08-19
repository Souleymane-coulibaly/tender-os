import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientAccountArchivedError, ClientPermission, GetClientAccountUseCase } from "../../../client-portfolio";
import { CandidateCompanyArchivedError, GetCandidateCompanyUseCase } from "../../../candidate-company";
import { BUYER_REPOSITORY, BuyerNotFoundError, type BuyerRepository } from "../../../tenders";
import { OpportunityPermission } from "../../domain/opportunity-permission";
import { parseOpportunitySource } from "../../domain/opportunity-source";
import { assertOpportunityFound } from "../../domain/opportunity.aggregate";
import { toOpportunitySummary, type OpportunitySummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { OPPORTUNITY_REPOSITORY, type OpportunityRepository } from "../ports/opportunity.repository";
import { assertHasOpportunityPermission } from "../policies/opportunity-authorization.policy";
import { assertOpportunityClientAccessAllowed } from "../policies/opportunity-client-access.policy";

export type UpdateOpportunityCommand = Readonly<{
  organizationId: string;
  opportunityId: string;
  actorId: string;
  actorRole: string;
  clientAccountId?: string | undefined;
  candidateCompanyId?: string | undefined;
  buyerId?: string | undefined;
  title?: string | undefined;
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

@Injectable()
export class UpdateOpportunityUseCase {
  constructor(
    @Inject(OPPORTUNITY_REPOSITORY) private readonly repository: OpportunityRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Inject(BUYER_REPOSITORY) private readonly buyerRepository: BuyerRepository,
    private readonly getCandidateCompanyUseCase: GetCandidateCompanyUseCase,
  ) {}

  async execute(command: UpdateOpportunityCommand): Promise<OpportunitySummary> {
    assertHasOpportunityPermission(command.actorRole, OpportunityPermission.Update);

    const opportunity = assertOpportunityFound(
      await this.repository.findById({ organizationId: command.organizationId, opportunityId: command.opportunityId }),
    );

    // Vérifié sur l'état ACTUEL avant modification (une Opportunity qui a déjà un candidat
    // résolu doit rester protégée même si `command.clientAccountId` ne change rien).
    await assertOpportunityClientAccessAllowed(opportunity, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageOpportunity,
    });

    if (command.candidateCompanyId !== undefined) {
      const candidateCompany = await this.getCandidateCompanyUseCase.execute({
        organizationId: command.organizationId,
        candidateCompanyId: command.candidateCompanyId,
      });
      if (candidateCompany.status === "ARCHIVED") {
        throw new CandidateCompanyArchivedError();
      }
    }

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

    if (command.buyerId !== undefined) {
      const buyer = await this.buyerRepository.findById({ organizationId: command.organizationId, buyerId: command.buyerId });
      if (!buyer) {
        throw new BuyerNotFoundError();
      }
    }

    const occurredAt = this.clock.now();

    opportunity.updateDetails(
      {
        clientAccountId: command.clientAccountId,
        candidateCompanyId: command.candidateCompanyId,
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
      },
      occurredAt,
    );

    await this.repository.save(opportunity);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "opportunity.updated",
      resourceType: "opportunity",
      resourceId: opportunity.id.value,
      requestId: command.requestId,
    });

    return toOpportunitySummary(opportunity);
  }
}
