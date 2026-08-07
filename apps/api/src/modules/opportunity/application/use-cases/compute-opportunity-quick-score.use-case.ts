import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { type CompanyProfileSummary, GetCompanyProfileUseCase } from "../../../company-profile";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { OpportunityPermission } from "../../domain/opportunity-permission";
import { assertOpportunityFound } from "../../domain/opportunity.aggregate";
import { computeOpportunityQuickScore, type QuickScoreCompanyProfileInput } from "../../domain/scoring/compute-opportunity-quick-score";
import { mapCompanyProfileToQuickScoreInput } from "../mappers/company-profile-to-quick-score-input.mapper";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { OPPORTUNITY_REPOSITORY, type OpportunityRepository } from "../ports/opportunity.repository";
import { OPPORTUNITY_QUICK_SCORE_REPOSITORY, type OpportunityQuickScoreRepository, type OpportunityQuickScoreRecord } from "../ports/opportunity-quick-score.repository";
import { assertHasOpportunityPermission } from "../policies/opportunity-authorization.policy";
import { assertOpportunityClientAccessAllowed } from "../policies/opportunity-client-access.policy";

export type ComputeOpportunityQuickScoreCommand = Readonly<{
  organizationId: string;
  opportunityId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/** Version du calculateur Niveau 1 — incrémentée si la logique de `computeOpportunityQuickScore`
 *  change, permet de savoir a posteriori sous quelle règle un ancien score a été produit (mission
 *  §29, jamais un recalcul silencieux des anciennes versions). */
const QUICK_SCORE_CALCULATION_VERSION = "1.0.0";

/**
 * Orchestrateur Niveau 1 — charge le profil entreprise candidate (si `clientAccountId` est déjà
 * résolu), le mappe vers la forme plate attendue par la fonction pure de scoring, persiste un
 * NOUVEAU `OpportunityQuickScore` (jamais un écrasement, mission §29), journalise et publie
 * l'événement Outbox correspondant.
 */
@Injectable()
export class ComputeOpportunityQuickScoreUseCase {
  constructor(
    @Inject(OPPORTUNITY_REPOSITORY) private readonly repository: OpportunityRepository,
    @Inject(OPPORTUNITY_QUICK_SCORE_REPOSITORY) private readonly quickScoreRepository: OpportunityQuickScoreRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly getCompanyProfileUseCase: GetCompanyProfileUseCase,
  ) {}

  async execute(command: ComputeOpportunityQuickScoreCommand): Promise<OpportunityQuickScoreRecord> {
    assertHasOpportunityPermission(command.actorRole, OpportunityPermission.ComputeQuickScore);

    const opportunity = assertOpportunityFound(
      await this.repository.findById({ organizationId: command.organizationId, opportunityId: command.opportunityId }),
    );

    await assertOpportunityClientAccessAllowed(opportunity, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageOpportunity,
    });

    const now = this.clock.now();

    let companyProfile: QuickScoreCompanyProfileInput | undefined;
    let companyProfileSummary: CompanyProfileSummary | undefined;
    if (opportunity.clientAccountId !== undefined) {
      companyProfileSummary = await this.getCompanyProfileUseCase.execute({
        organizationId: command.organizationId,
        clientAccountId: opportunity.clientAccountId,
        actorId: command.actorId,
        actorRole: command.actorRole,
      });
      companyProfile = mapCompanyProfileToQuickScoreInput(companyProfileSummary, opportunity.sector);
    }

    const result = computeOpportunityQuickScore({
      sector: opportunity.sector,
      location: opportunity.location,
      geographicZone: opportunity.geographicZone,
      submissionDeadline: opportunity.submissionDeadline,
      now,
      companyProfile,
    });

    const record = await this.quickScoreRepository.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      opportunityId: command.opportunityId,
      calculationVersion: QUICK_SCORE_CALCULATION_VERSION,
      requestedByUserId: command.actorId,
      dataSnapshot: { companyProfile: companyProfileSummary ?? null },
      createdAt: now,
      result,
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "opportunity.quick_score_computed",
      resourceType: "opportunity",
      resourceId: command.opportunityId,
      requestId: command.requestId,
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "OpportunityQuickScoreComputed",
          aggregateType: "Opportunity",
          aggregateId: command.opportunityId,
          payload: { opportunityId: command.opportunityId, scoreVersion: record.scoreVersion, globalScore: record.globalScore },
          occurredAt: now,
        },
      ],
    });

    return record;
  }
}

