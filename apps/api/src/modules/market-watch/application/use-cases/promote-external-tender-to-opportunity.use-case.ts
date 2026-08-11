import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { CreateOpportunityUseCase, type OpportunitySummary } from "../../../opportunity";
import { ExternalTenderAlreadyPromotedError, ExternalTenderNotFoundError } from "../../domain/errors";
import { assertHasMarketWatchPermission, MarketWatchPermission } from "../../domain/market-watch-permission";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { EXTERNAL_TENDER_REPOSITORY, type ExternalTenderRepository } from "../ports/external-tender.repository";
import { EXTERNAL_TENDER_PROMOTION_REPOSITORY, type ExternalTenderPromotionRepository } from "../ports/external-tender-promotion.repository";

export type PromoteExternalTenderToOpportunityCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  externalTenderId: string;
  clientAccountId?: string | undefined;
  /** Mission §56 — "prévenir l'utilisateur, ne pas dupliquer silencieusement" : sans ce flag, une
   *  promotion déjà existante pour ce (marché, client) échoue avec `ExternalTenderAlreadyPromotedError`
   *  (contenant l'Opportunity existante) plutôt que de créer un doublon silencieux. */
  confirmDuplicate?: boolean | undefined;
  requestId?: string | undefined;
}>;

/**
 * Mission §53/§55 — "Ajouter à mes opportunités", jamais automatique (mission §4 "Veille ≠
 * Tender"). Délègue ENTIÈREMENT à `CreateOpportunityUseCase` (permission/ClientAccess/audit/Outbox
 * déjà là) — ce use-case ne fait que mapper les champs normalisés et enregistrer la provenance
 * (mission §54/§56).
 *
 * Correctif audit P1-002 — le duo lecture (`findByExternalTenderAndClient`) puis écriture
 * (`CreateOpportunityUseCase.execute` + `promotionRepository.create`) formait un "check-then-act"
 * non protégé : deux clics simultanés (ou deux requêtes concurrentes) pouvaient chacun lire "aucune
 * promotion existante" avant que l'un n'ait committé, créant deux Opportunities pour le même
 * marché/client. Fermé en enveloppant TOUTE la séquence dans une seule transaction Postgres
 * (`AtomicTransactionRunner`, même motif que `ApplyAiSuggestionUseCase`), avec un verrou consultatif
 * (`ExternalTenderPromotionRepository.lockForPromotion`) acquis EN PREMIER : la seconde requête
 * concurrente bloque jusqu'au commit/rollback de la première, puis relit l'état à jour et détecte
 * correctement la promotion désormais existante.
 */
@Injectable()
export class PromoteExternalTenderToOpportunityUseCase {
  constructor(
    @Inject(EXTERNAL_TENDER_REPOSITORY) private readonly externalTenderRepository: ExternalTenderRepository,
    @Inject(EXTERNAL_TENDER_PROMOTION_REPOSITORY) private readonly promotionRepository: ExternalTenderPromotionRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly createOpportunityUseCase: CreateOpportunityUseCase,
  ) {}

  async execute(command: PromoteExternalTenderToOpportunityCommand): Promise<OpportunitySummary> {
    assertHasMarketWatchPermission(command.actorRole, MarketWatchPermission.Read);

    const tender = await this.externalTenderRepository.findById({ organizationId: command.organizationId, externalTenderId: command.externalTenderId });
    if (!tender) {
      throw new ExternalTenderNotFoundError();
    }

    return this.atomicTransactionRunner.run(async () => {
      // Correctif audit P1-002 — verrou AVANT la lecture de dédoublonnage : sérialise deux
      // promotions concurrentes du même (marché, client) sans jamais bloquer deux marchés distincts
      // ou deux clients distincts entre eux.
      await this.promotionRepository.lockForPromotion({
        organizationId: command.organizationId,
        externalTenderId: command.externalTenderId,
        clientAccountId: command.clientAccountId,
      });

      const existingPromotion = await this.promotionRepository.findByExternalTenderAndClient({
        organizationId: command.organizationId,
        externalTenderId: command.externalTenderId,
        clientAccountId: command.clientAccountId,
      });
      if (existingPromotion && !command.confirmDuplicate) {
        throw new ExternalTenderAlreadyPromotedError(existingPromotion.opportunityId);
      }

      const opportunity = await this.createOpportunityUseCase.execute({
        organizationId: command.organizationId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        clientAccountId: command.clientAccountId,
        title: tender.title,
        description: tender.description,
        source: tender.source,
        externalReference: tender.externalId,
        buyerName: tender.buyerName,
        cpvCode: tender.cpvCodes[0],
        location: tender.city ?? tender.department ?? tender.region ?? tender.country,
        geographicZone: tender.region,
        publicationDate: tender.publicationDate?.toISOString(),
        submissionDeadline: tender.submissionDeadline?.toISOString(),
        estimatedAmount: tender.estimatedAmount?.toString(),
        currency: tender.currency,
        procedureType: tender.procedureType,
        requestId: command.requestId,
      });

      const occurredAt = this.clock.now();
      await this.promotionRepository.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        externalTenderId: tender.id,
        clientAccountId: command.clientAccountId,
        opportunityId: opportunity.id,
        createdBy: command.actorId,
        createdAt: occurredAt,
      });

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "ExternalTenderPromotedToOpportunity",
        resourceType: "external_tender",
        resourceId: tender.id,
        requestId: command.requestId,
        metadata: { opportunityId: opportunity.id, clientAccountId: command.clientAccountId },
      });

      return opportunity;
    });
  }
}
