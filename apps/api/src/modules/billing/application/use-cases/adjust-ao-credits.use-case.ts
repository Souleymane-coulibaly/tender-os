import { Inject, Injectable } from "@nestjs/common";
import { assertHasCapability, PlatformCapability, type PlatformRole } from "../../../platform-administration";
import type { AoCreditLedgerEntry } from "../../domain/ao-credit-ledger-entry";
import { AoCreditAdjustmentReasonRequiredError } from "../../domain/errors";
import { AO_CREDIT_LEDGER_REPOSITORY, type AoCreditLedgerRepository } from "../ports/ao-credit-ledger.repository";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";

export type AdjustAoCreditsCommand = Readonly<{
  organizationId: string;
  /** Positif (crédit) ou négatif (débit) — jamais un solde final imposé directement (mission §31
   *  "+1/-1"), toujours un delta explicite tracé. */
  amount: number;
  reason: string;
  actorPlatformAdministratorId: string;
  actorPlatformRole: PlatformRole;
  occurredAt: Date;
}>;

/**
 * V2 Sprint 22 (billing, étape 22B) — mission §31/§48 "Organization Admin ne peut pas modifier son
 * propre solde" : Platform Admin only (ADMIN/OWNER, jamais SUPPORT), raison obligatoire, ledger +
 * AuditLog systématiques. Le solde ne descend jamais sous 0, même pour un ajustement négatif trop
 * important (l'ajustement réellement appliqué est plafonné, jamais un solde négatif silencieux).
 */
@Injectable()
export class AdjustAoCreditsUseCase {
  constructor(
    @Inject(AO_CREDIT_LEDGER_REPOSITORY) private readonly ledgerRepository: AoCreditLedgerRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: AdjustAoCreditsCommand): Promise<AoCreditLedgerEntry> {
    assertHasCapability(command.actorPlatformRole, PlatformCapability.AoCreditsManage);

    if (command.reason.trim().length === 0) {
      throw new AoCreditAdjustmentReasonRequiredError();
    }

    const entry = await this.ledgerRepository.adjust({
      organizationId: command.organizationId,
      amount: command.amount,
      reason: command.reason,
      actorPlatformAdministratorId: command.actorPlatformAdministratorId,
      occurredAt: command.occurredAt,
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorPlatformAdministratorId,
      action: "AoCreditsAdjusted",
      resourceType: "AoCreditLedgerEntry",
      resourceId: entry.id,
      metadata: { requestedAmount: command.amount, appliedAmount: entry.amount, reason: command.reason, balanceAfter: entry.balanceAfter },
    });

    return entry;
  }
}
