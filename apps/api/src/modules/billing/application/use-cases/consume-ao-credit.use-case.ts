import { Inject, Injectable } from "@nestjs/common";
import { getPlanQuotaLimit } from "../../domain/plan-catalog";
import { QuotaType, UNLIMITED } from "../../domain/quota-type";
import { InsufficientAoCreditsError } from "../../domain/errors";
import { AO_CREDIT_LEDGER_REPOSITORY, type AoCreditLedgerRepository } from "../ports/ao-credit-ledger.repository";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY, type OrganizationSubscriptionRepository } from "../ports/organization-subscription.repository";
import { PASS_PURCHASE_REPOSITORY, type PassPurchaseRepository } from "../ports/pass-purchase.repository";
import { ConsumePassForTenderUseCase } from "./consume-pass-for-tender.use-case";

export type ConsumeAoCreditCommand = Readonly<{ organizationId: string; tenderId: string; actorId: string; occurredAt: Date }>;

/**
 * V2 Sprint 22 (billing, étape 22B) — mission §19 : audit de l'existant (voir le rapport 22B)
 * conclut que `CreateTenderUseCase.execute()` est l'UNIQUE point d'insertion réelle d'un Tender
 * dans ce système, quelle que soit son origine (création manuelle, promotion d'Opportunity,
 * chaîne market-watch -> Opportunity -> Tender) : ce use case est donc le point de consommation
 * "AO traité" choisi, jamais dupliqué à un second endroit.
 *
 * Deux mécanismes de crédit distincts (mission §17/§20, jamais unifiés artificiellement) :
 *   - abonnement actif à quota FINI (Starter/Business) -> ledger AO (compare-and-set, mission §16) ;
 *   - abonnement actif ILLIMITÉ (Enterprise, mission §14) -> jamais bloqué, jamais de ledger ;
 *   - pas d'abonnement actif -> un Pass AVAILABLE doit exister, sinon refus (mission — aucun palier
 *     gratuit n'existe dans le catalogue, voir plan-catalog.ts).
 */
@Injectable()
export class ConsumeAoCreditUseCase {
  constructor(
    @Inject(ORGANIZATION_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: OrganizationSubscriptionRepository,
    @Inject(PASS_PURCHASE_REPOSITORY) private readonly passPurchaseRepository: PassPurchaseRepository,
    @Inject(AO_CREDIT_LEDGER_REPOSITORY) private readonly ledgerRepository: AoCreditLedgerRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    private readonly consumePassForTenderUseCase: ConsumePassForTenderUseCase,
  ) {}

  async execute(command: ConsumeAoCreditCommand): Promise<void> {
    const subscription = await this.subscriptionRepository.findByOrganizationId(command.organizationId);

    if (subscription && subscription.isActive) {
      const monthlyGrantLimit = getPlanQuotaLimit(subscription.planTier, QuotaType.AoMonthlyGrant);
      if (monthlyGrantLimit === UNLIMITED) {
        // Mission §14 — fair-use illimité (Enterprise) : jamais de ledger numérique, jamais bloqué.
        await this.auditLogWriter.record({
          organizationId: command.organizationId,
          actorId: command.actorId,
          action: "AoCreditsConsumed",
          resourceType: "Tender",
          resourceId: command.tenderId,
          metadata: { unlimited: true },
        });
        return;
      }

      const { applied, entry } = await this.ledgerRepository.consume({ organizationId: command.organizationId, tenderId: command.tenderId, amount: 1, occurredAt: command.occurredAt });
      if (!applied) {
        throw new InsufficientAoCreditsError(command.organizationId);
      }

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "AoCreditsConsumed",
        resourceType: "AoCreditLedgerEntry",
        resourceId: entry!.id,
        metadata: { tenderId: command.tenderId, balanceAfter: entry!.balanceAfter },
      });
      return;
    }

    const availablePass = await this.passPurchaseRepository.findFirstAvailable(command.organizationId, command.occurredAt);
    if (!availablePass) {
      throw new InsufficientAoCreditsError(command.organizationId);
    }

    await this.consumePassForTenderUseCase.execute({
      organizationId: command.organizationId,
      passPurchaseId: availablePass.id,
      tenderId: command.tenderId,
      actorId: command.actorId,
      occurredAt: command.occurredAt,
    });
  }
}
