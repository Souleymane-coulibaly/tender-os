import { Inject, Injectable } from "@nestjs/common";
import type { AoCreditLedgerEntry } from "../../domain/ao-credit-ledger-entry";
import { AO_CREDIT_LEDGER_REPOSITORY, type AoCreditLedgerRepository } from "../ports/ao-credit-ledger.repository";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";

export type GrantTrialAoCreditCommand = Readonly<{ organizationId: string; actorId: string; occurredAt: Date }>;

/**
 * V2 Sprint 25 (Trial Starter) — mission §16/§17 : exactement 1 crédit AO à l'entrée en TRIALING,
 * jamais `balance = 1` directement (voir `AoCreditMovementType.TrialGrant`). Idempotent "au plus
 * une fois par organisation, jamais" (mission §18 "même Trial activé deux fois par webhook/retry :
 * 1 seul crédit") — appelé depuis `HandleStripeWebhookUseCase` dès la première observation d'un
 * statut Stripe `trialing` pour cette organisation, jamais depuis une action utilisateur/le retour
 * Checkout (mission §10/§13 : le Trial démarre à l'activation RÉELLE de la Subscription, jamais au
 * clic Landing).
 */
@Injectable()
export class GrantTrialAoCreditUseCase {
  constructor(
    @Inject(AO_CREDIT_LEDGER_REPOSITORY) private readonly ledgerRepository: AoCreditLedgerRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: GrantTrialAoCreditCommand): Promise<AoCreditLedgerEntry> {
    const { entry, alreadyApplied } = await this.ledgerRepository.grantTrial({
      organizationId: command.organizationId,
      occurredAt: command.occurredAt,
    });

    if (!alreadyApplied) {
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "AoTrialCreditGranted",
        resourceType: "AoCreditLedgerEntry",
        resourceId: entry.id,
        metadata: { amount: entry.amount, balanceAfter: entry.balanceAfter },
      });
    }

    return entry;
  }
}
