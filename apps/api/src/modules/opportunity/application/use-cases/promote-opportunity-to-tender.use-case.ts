import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { CreateTenderUseCase, GetTenderUseCase, type TenderSummary } from "../../../tenders";
import { GoNoGoAdminBypassJustificationRequiredError, OpportunityMissingClientAccountError, OpportunityPromotionConflictError, OpportunityPromotionRequiresGoDecisionError } from "../../domain/errors";
import { GoNoGoDecisionValue } from "../../domain/go-no-go-decision";
import { OpportunityPermission } from "../../domain/opportunity-permission";
import { assertOpportunityFound } from "../../domain/opportunity.aggregate";
import { OpportunityStatus } from "../../domain/opportunity-status";
import { toOpportunitySummary, type OpportunitySummary } from "../dtos";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { GO_NO_GO_DECISION_REPOSITORY, type GoNoGoDecisionRepository } from "../ports/go-no-go-decision.repository";
import { OPPORTUNITY_REPOSITORY, type OpportunityRepository } from "../ports/opportunity.repository";
import { assertHasOpportunityPermission } from "../policies/opportunity-authorization.policy";
import { resolveGoNoGoClientAccess } from "../policies/go-no-go-client-access.policy";

export type PromoteOpportunityToTenderCommand = Readonly<{
  organizationId: string;
  opportunityId: string;
  actorId: string;
  actorRole: string;
  // Audit Codex round 2 — obligatoire uniquement si l'acteur agit via le contournement
  // administratif (`resolveGoNoGoClientAccess`), jamais pour le chemin normal CLIENT_MANAGER.
  justification?: string | undefined;
  requestId?: string | undefined;
}>;

export type PromoteOpportunityToTenderResult = Readonly<{
  opportunity: OpportunitySummary;
  tender: TenderSummary;
  alreadyPromoted: boolean;
}>;

const ELIGIBLE_STATUSES = [OpportunityStatus.Go, OpportunityStatus.GoConditional] as const;

/** Marqueur interne, jamais exposé hors de ce fichier — distingue "la réservation a perdu la
 *  course face à une promotion concurrente légitime" (idempotent, mission §21) d'un vrai conflit
 *  (statut devenu incompatible, ex. DISMISSED). Forcer un throw ici est le SEUL moyen d'annuler le
 *  Tender fraîchement créé dans cette transaction perdante (voir le commentaire de classe) ; la
 *  distinction se fait APRÈS le rollback, en relisant l'état réellement commité par le gagnant. */
class ReservationLostRaceError extends Error {}

/**
 * Promotion Opportunity -> Tender (mission §20-22) — point d'orchestration le plus sensible du
 * sprint. Ne transforme JAMAIS une Opportunity directement en Tender : crée toujours un NOUVEAU
 * Tender via le use case public existant (`CreateTenderUseCase`, module `tenders`), jamais une
 * seconde logique de création dupliquée. Refuse strictement toute promotion tant que la DERNIÈRE
 * décision Niveau OPPORTUNITY n'est pas GO/GO_CONDITIONAL — aucune dérogation NO_GO ce sprint
 * (décision produit confirmée). Idempotente : une Opportunity déjà PROMOTED renvoie le Tender déjà
 * lié, jamais un second Tender.
 *
 * Atomicité totale (même motif que `ApplyAiSuggestionUseCase`, `ai-suggestion-bridge`, Sprint 4
 * round 4) — relecture de la dernière décision (ferme la fenêtre TOCTOU), création du Tender ET
 * réservation/finalisation de l'Opportunity s'exécutent DANS UNE SEULE transaction Postgres : si la
 * réservation échoue après création du Tender (race concurrente), TOUTE la transaction — y compris
 * le Tender fraîchement créé — est annulée (rollback), jamais un Tender orphelin persisté.
 */
@Injectable()
export class PromoteOpportunityToTenderUseCase {
  constructor(
    @Inject(OPPORTUNITY_REPOSITORY) private readonly opportunityRepository: OpportunityRepository,
    @Inject(GO_NO_GO_DECISION_REPOSITORY) private readonly decisionRepository: GoNoGoDecisionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly createTenderUseCase: CreateTenderUseCase,
    private readonly getTenderUseCase: GetTenderUseCase,
  ) {}

  async execute(command: PromoteOpportunityToTenderCommand): Promise<PromoteOpportunityToTenderResult> {
    assertHasOpportunityPermission(command.actorRole, OpportunityPermission.Promote);

    const opportunity = assertOpportunityFound(
      await this.opportunityRepository.findById({ organizationId: command.organizationId, opportunityId: command.opportunityId }),
    );

    const clientAccountId = opportunity.clientAccountId;
    if (clientAccountId === undefined) {
      throw new OpportunityMissingClientAccountError();
    }

    const { viaAdminBypass } = await resolveGoNoGoClientAccess({
      assertClientAccessUseCase: this.assertClientAccessUseCase,
      organizationId: command.organizationId,
      clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.PromoteOpportunity,
    });
    if (viaAdminBypass && !command.justification?.trim()) {
      throw new GoNoGoAdminBypassJustificationRequiredError();
    }

    // Court-circuit hors-transaction (confort, jamais la seule garantie d'idempotence — la
    // vérification déterminante est refaite DANS la transaction ci-dessous).
    if (opportunity.status === OpportunityStatus.Promoted && opportunity.tenderId) {
      const tender = await this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: opportunity.tenderId, actorRole: command.actorRole });
      return { opportunity: toOpportunitySummary(opportunity), tender, alreadyPromoted: true };
    }

    try {
      return await this.atomicTransactionRunner.run(async () => this.runInTransaction(command, viaAdminBypass));
    } catch (error) {
      if (!(error instanceof ReservationLostRaceError)) {
        throw error;
      }

      // La réservation a perdu la course face à une promotion concurrente légitime (mission §21,
      // "idempotente") — TOUTE cette transaction, y compris le Tender qu'elle avait créé, vient
      // d'être annulée (rollback). On relit maintenant l'état RÉELLEMENT commité par le gagnant,
      // hors transaction, pour décider : idempotent (renvoyer SON Tender) ou vrai conflit (ex.
      // l'Opportunity a été DISMISSED entretemps par un autre acteur).
      const settled = assertOpportunityFound(
        await this.opportunityRepository.findById({ organizationId: command.organizationId, opportunityId: command.opportunityId }),
      );
      if (settled.status === OpportunityStatus.Promoted && settled.tenderId) {
        const tender = await this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: settled.tenderId, actorRole: command.actorRole });
        return { opportunity: toOpportunitySummary(settled), tender, alreadyPromoted: true };
      }
      throw new OpportunityPromotionConflictError();
    }
  }

  private async runInTransaction(command: PromoteOpportunityToTenderCommand, viaAdminBypass: boolean): Promise<PromoteOpportunityToTenderResult> {
    // Relecture DANS la transaction — ferme la fenêtre TOCTOU entre la vérification ci-dessus et
    // la réservation (mission §22, décision produit confirmée : "aucune dérogation NO_GO").
    const latestDecision = await this.decisionRepository.getLatestByOpportunity({ organizationId: command.organizationId, opportunityId: command.opportunityId });
    if (!latestDecision || latestDecision.decision === GoNoGoDecisionValue.NoGo) {
      throw new OpportunityPromotionRequiresGoDecisionError();
    }

    const current = assertOpportunityFound(
      await this.opportunityRepository.findById({ organizationId: command.organizationId, opportunityId: command.opportunityId }),
    );

    if (current.status === OpportunityStatus.Promoted && current.tenderId) {
      const tender = await this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: current.tenderId, actorRole: command.actorRole });
      return { opportunity: toOpportunitySummary(current), tender, alreadyPromoted: true };
    }

    const currentClientAccountId = current.clientAccountId;
    if (currentClientAccountId === undefined) {
      throw new OpportunityMissingClientAccountError();
    }

    // Le Tender est créé AVANT la réservation (son id n'existe pas avant) — sans risque d'orphelin
    // : si la réservation échoue ensuite, TOUTE la transaction (y compris cette création) est
    // annulée (voir le commentaire de classe). Champs relus depuis `current` (fraîchement chargé
    // DANS la transaction), jamais depuis `opportunity` (lu avant l'ouverture de la transaction).
    const tender = await this.createTenderUseCase.execute({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientAccountId: currentClientAccountId,
      // Mission 2.1-A3 §13 — propagation explicite et testée : si l'Opportunity porte une
      // CandidateCompany résolue, le Tender promu la reçoit directement à la création (jamais un
      // second appel séparé, jamais une valeur par défaut inventée quand elle est absente).
      candidateCompanyId: current.candidateCompanyId,
      title: current.title,
      buyerId: current.buyerId,
      buyerName: current.buyerName,
      description: current.description,
      publicationDate: current.publicationDate?.toISOString(),
      submissionDeadline: current.submissionDeadline?.toISOString(),
      executionLocation: current.location,
      geographicZone: current.geographicZone,
      procedureType: current.procedureType,
      externalReference: current.externalReference,
      estimatedAmount: current.estimatedAmount,
      currency: current.currency,
      requestId: command.requestId,
    });

    const occurredAt = this.clock.now();

    const reserved = await this.opportunityRepository.transitionToPromoted({
      organizationId: command.organizationId,
      opportunityId: command.opportunityId,
      fromStatuses: ELIGIBLE_STATUSES,
      tenderId: tender.id,
      updatedAt: occurredAt,
    });

    if (!reserved) {
      // Un autre acteur a modifié l'Opportunity entre la lecture ci-dessus et cette réservation
      // (double promotion concurrente légitime, ou changement de statut incompatible) — jamais un
      // Tender orphelin : lever une erreur annule TOUTE la transaction, y compris `tender`
      // ci-dessus. `execute()` distingue ensuite idempotence/vrai conflit APRÈS le rollback.
      throw new ReservationLostRaceError();
    }

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "opportunity.promoted_to_tender",
      resourceType: "opportunity",
      resourceId: command.opportunityId,
      requestId: command.requestId,
      metadata: viaAdminBypass ? { clientAssignmentBypass: true } : undefined,
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "OpportunityPromotedToTender",
          aggregateType: "Opportunity",
          aggregateId: command.opportunityId,
          payload: { opportunityId: command.opportunityId, tenderId: tender.id },
          occurredAt,
        },
      ],
    });

    return { opportunity: toOpportunitySummary(reserved), tender, alreadyPromoted: false };
  }
}
