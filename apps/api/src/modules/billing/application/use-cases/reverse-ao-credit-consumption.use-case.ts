import { Inject, Injectable } from "@nestjs/common";
import { assertHasCapability, PlatformCapability, type PlatformRole } from "../../../platform-administration";
import type { AoCreditLedgerEntry } from "../../domain/ao-credit-ledger-entry";
import { AoCreditAdjustmentReasonRequiredError } from "../../domain/errors";
import { AO_CREDIT_LEDGER_REPOSITORY, type AoCreditLedgerRepository } from "../ports/ao-credit-ledger.repository";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";

export type ReverseAoCreditConsumptionCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  reason: string;
  actorPlatformAdministratorId: string;
  actorPlatformRole: PlatformRole;
  occurredAt: Date;
}>;

/**
 * V2 Sprint 22 (billing, étape 22B) — mission §7 (Pass) appliqué par symétrie au ledger AO
 * d'abonnement : "une correction exceptionnelle doit passer par Platform Admin et être auditée",
 * jamais un chemin normal (aucun Organization Admin ne peut annuler sa propre consommation).
 */
@Injectable()
export class ReverseAoCreditConsumptionUseCase {
  constructor(
    @Inject(AO_CREDIT_LEDGER_REPOSITORY) private readonly ledgerRepository: AoCreditLedgerRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: ReverseAoCreditConsumptionCommand): Promise<AoCreditLedgerEntry> {
    assertHasCapability(command.actorPlatformRole, PlatformCapability.AoCreditsManage);

    if (command.reason.trim().length === 0) {
      throw new AoCreditAdjustmentReasonRequiredError();
    }

    const entry = await this.ledgerRepository.reverseConsumption({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
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
      metadata: { tenderId: command.tenderId, reason: command.reason, balanceAfter: entry.balanceAfter, reversal: true },
    });

    return entry;
  }
}
