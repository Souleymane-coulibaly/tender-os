import { Inject, Injectable } from "@nestjs/common";
import { getPlanQuotaLimit } from "../../domain/plan-catalog";
import { QuotaType, UNLIMITED } from "../../domain/quota-type";
import type { AoCreditLedgerEntry } from "../../domain/ao-credit-ledger-entry";
import { AoCreditGrantNotApplicableError, SubscriptionNotFoundError } from "../../domain/errors";
import { AO_CREDIT_LEDGER_REPOSITORY, type AoCreditLedgerRepository } from "../ports/ao-credit-ledger.repository";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY, type OrganizationSubscriptionRepository } from "../ports/organization-subscription.repository";

export type GrantMonthlyAoCreditsCommand = Readonly<{
  organizationId: string;
  /** "YYYY-MM" — jamais calculé implicitement ici à partir de `occurredAt` (mission §17 : le
   *  déclenchement mensuel réel dépend du cycle de facturation Stripe, 22C ; ce use case reste un
   *  mécanisme pur, réutilisable quel que soit l'appelant qui décide QUAND). */
  period: string;
  actorId: string;
  occurredAt: Date;
}>;

/**
 * V2 Sprint 22 (billing, étape 22B) — mission §17 : plafonne le montant nominal du palier par le
 * rollover cap AU MOMENT du grant (`AoCreditLedgerRepository.grant`), jamais un grant plein suivi
 * d'un écrêtage a posteriori. Idempotent par (organizationId, period) — un second appel pour le
 * MÊME mois renvoie l'entrée déjà existante, jamais un second crédit (tolère un rejeu de job sans
 * décider ici QUAND ce rejeu doit avoir lieu, laissé à 22C).
 */
@Injectable()
export class GrantMonthlyAoCreditsUseCase {
  constructor(
    @Inject(ORGANIZATION_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: OrganizationSubscriptionRepository,
    @Inject(AO_CREDIT_LEDGER_REPOSITORY) private readonly ledgerRepository: AoCreditLedgerRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: GrantMonthlyAoCreditsCommand): Promise<{ entry: AoCreditLedgerEntry; alreadyApplied: boolean }> {
    const subscription = await this.subscriptionRepository.findByOrganizationId(command.organizationId);
    // V2 Sprint 25 (Trial Starter) — `isEntitled` (ACTIVE ou TRIALING), voir `entitlement.service.ts`.
    if (!subscription || !subscription.isEntitled) {
      throw new SubscriptionNotFoundError(command.organizationId);
    }

    const nominalAmount = getPlanQuotaLimit(subscription.planTier, QuotaType.AoMonthlyGrant);
    const rolloverCap = getPlanQuotaLimit(subscription.planTier, QuotaType.AoRolloverCap);
    if (nominalAmount === UNLIMITED || rolloverCap === UNLIMITED) {
      throw new AoCreditGrantNotApplicableError(command.organizationId);
    }

    const { entry, alreadyApplied } = await this.ledgerRepository.grant({
      organizationId: command.organizationId,
      period: command.period,
      nominalAmount,
      rolloverCap,
      occurredAt: command.occurredAt,
    });

    if (!alreadyApplied) {
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "AoCreditsGranted",
        resourceType: "AoCreditLedgerEntry",
        resourceId: entry.id,
        metadata: { period: command.period, amount: entry.amount, balanceAfter: entry.balanceAfter },
      });
    }

    // Checkpoint TENDEROS-2.1-P2.3-E1.2, ANNUAL CATCHUP — `alreadyApplied` désormais exposé à
    // l'appelant (`GrantMonthlyAoCreditsForYearlySubscriptionsUseCase`), qui doit savoir SI un
    // rattrapage a réellement produit un nouveau crédit pour chaque période, jamais seulement que
    // l'appel a réussi (idempotence transparente pour tout appelant qui n'en a pas besoin).
    return { entry, alreadyApplied };
  }
}
