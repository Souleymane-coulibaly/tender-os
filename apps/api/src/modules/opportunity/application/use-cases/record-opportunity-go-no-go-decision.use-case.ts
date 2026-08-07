import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { GoNoGoAdminBypassJustificationRequiredError, OpportunityQuickScoreNotFoundError } from "../../domain/errors";
import { assertValidGoNoGoDecisionInput, GoNoGoDecisionLevel, opportunityStatusForDecision, parseGoNoGoDecisionValue } from "../../domain/go-no-go-decision";
import { OpportunityPermission } from "../../domain/opportunity-permission";
import { assertOpportunityFound } from "../../domain/opportunity.aggregate";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { GO_NO_GO_DECISION_REPOSITORY, type GoNoGoDecisionRecord, type GoNoGoDecisionRepository } from "../ports/go-no-go-decision.repository";
import { OPPORTUNITY_QUICK_SCORE_REPOSITORY, type OpportunityQuickScoreRepository } from "../ports/opportunity-quick-score.repository";
import { OPPORTUNITY_REPOSITORY, type OpportunityRepository } from "../ports/opportunity.repository";
import { assertHasOpportunityPermission } from "../policies/opportunity-authorization.policy";
import { resolveGoNoGoClientAccess } from "../policies/go-no-go-client-access.policy";

export type RecordOpportunityGoNoGoDecisionCommand = Readonly<{
  organizationId: string;
  opportunityId: string;
  actorId: string;
  actorRole: string;
  decision: string;
  justification?: string | undefined;
  conditions?: string | undefined;
  comment?: string | undefined;
  linkedQuickScoreId?: string | undefined;
  requestId?: string | undefined;
}>;

/**
 * Décision humaine Niveau OPPORTUNITY (mission §18) — synchronise ATOMIQUEMENT `Opportunity.status`
 * avec la décision (seul point d'entrée qui déclenche cette transition, voir le commentaire de
 * `opportunity-status.ts`). Toujours une NOUVELLE ligne append-only (mission §29, jamais un
 * écrasement) ; la justification/les conditions restent obligatoires au niveau DOMAINE (mission
 * §18), pas seulement en base.
 */
@Injectable()
export class RecordOpportunityGoNoGoDecisionUseCase {
  constructor(
    @Inject(GO_NO_GO_DECISION_REPOSITORY) private readonly decisionRepository: GoNoGoDecisionRepository,
    @Inject(OPPORTUNITY_REPOSITORY) private readonly opportunityRepository: OpportunityRepository,
    @Inject(OPPORTUNITY_QUICK_SCORE_REPOSITORY) private readonly quickScoreRepository: OpportunityQuickScoreRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: RecordOpportunityGoNoGoDecisionCommand): Promise<GoNoGoDecisionRecord> {
    assertHasOpportunityPermission(command.actorRole, OpportunityPermission.RecordDecision);

    const opportunity = assertOpportunityFound(
      await this.opportunityRepository.findById({ organizationId: command.organizationId, opportunityId: command.opportunityId }),
    );

    const { viaAdminBypass } = await resolveGoNoGoClientAccess({
      assertClientAccessUseCase: this.assertClientAccessUseCase,
      organizationId: command.organizationId,
      clientAccountId: opportunity.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.RecordGoNoGoDecision,
    });
    // Audit Codex round 2 (P1 confirmé) — le contournement administratif (OWNER/ORGANIZATION_ADMIN
    // sans affectation CLIENT_MANAGER réelle) exige TOUJOURS une justification explicite, quelle que
    // soit la décision (GO/GO_CONDITIONAL n'en imposent normalement aucune) : c'est le prix du
    // filet de sécurité anti-lockout, jamais un accès silencieux.
    if (viaAdminBypass && !command.justification?.trim()) {
      throw new GoNoGoAdminBypassJustificationRequiredError();
    }

    const decision = parseGoNoGoDecisionValue(command.decision);
    assertValidGoNoGoDecisionInput({ decision, justification: command.justification, conditions: command.conditions });

    if (command.linkedQuickScoreId !== undefined) {
      const versions = await this.quickScoreRepository.listVersions({ organizationId: command.organizationId, opportunityId: command.opportunityId });
      if (!versions.some((v) => v.id === command.linkedQuickScoreId)) {
        throw new OpportunityQuickScoreNotFoundError();
      }
    }

    const occurredAt = this.clock.now();

    // Correctif audit Codex (round 1) — le commentaire de classe promettait une synchronisation
    // ATOMIQUE entre le changement de statut et l'enregistrement de la décision, mais rien ne le
    // garantissait réellement : si `decisionRepository.create` échouait APRÈS le `save()` du
    // statut, l'Opportunity restait GO/GO_CONDITIONAL/NO_GO sans aucune `GoNoGoDecision`
    // correspondante — violation directe de mission §18 ("jamais une décision de statut sans
    // historique"). Toute la séquence (statut + décision + audit + Outbox) s'exécute maintenant
    // dans UNE SEULE transaction Postgres (même motif que `PromoteOpportunityToTenderUseCase`) :
    // rollback total si n'importe quelle étape échoue, jamais un état à moitié appliqué.
    return this.atomicTransactionRunner.run(async () => {
      // Même mécanisme de statut que le funnel amont (`ChangeOpportunityStatusUseCase`) —
      // l'agrégat refuse lui-même toute transition non autorisée (ex. décider avant QUALIFIED).
      opportunity.changeStatus(opportunityStatusForDecision(decision), occurredAt);
      await this.opportunityRepository.save(opportunity);

      const record = await this.decisionRepository.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        level: GoNoGoDecisionLevel.Opportunity,
        opportunityId: command.opportunityId,
        linkedQuickScoreId: command.linkedQuickScoreId,
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
        action: "opportunity.go_no_go_decision_recorded",
        resourceType: "opportunity",
        resourceId: command.opportunityId,
        requestId: command.requestId,
        // Audit Codex round 2 — trace explicite du contournement administratif (voir
        // `resolveGoNoGoClientAccess`), pour permettre une revue a posteriori des décisions prises
        // sans affectation client réelle.
        metadata: viaAdminBypass ? { clientAssignmentBypass: true } : undefined,
      });

      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: "GoNoGoDecisionRecorded",
            aggregateType: "Opportunity",
            aggregateId: command.opportunityId,
            payload: { opportunityId: command.opportunityId, level: GoNoGoDecisionLevel.Opportunity, decision },
            occurredAt,
          },
        ],
      });

      return record;
    });
  }
}
