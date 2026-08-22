import { Inject, Injectable } from "@nestjs/common";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { ORGANIZATION_SUBSCRIPTION_REPOSITORY, type OrganizationSubscriptionRepository } from "../ports/organization-subscription.repository";
import { PASS_PURCHASE_REPOSITORY, type PassPurchaseRepository } from "../ports/pass-purchase.repository";

export type ReservePassForTenderCommand = Readonly<{ organizationId: string; tenderId: string; actorId: string; occurredAt: Date }>;

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1.3 — mission §2 (SÉPARER AUTORISATION ET ALLOCATION), correctif du
 * finding Codex P1-A : la réservation d'un Pass est désormais une ALLOCATION EXPLICITE, jamais un
 * effet de bord de `EntitlementService.canOperateOnTender` (devenu PURE). Ce use case est le SEUL
 * point d'entrée qui écrit réellement une réservation — appelé UNIQUEMENT par
 * `EntitlementService.runTenderOperationEntitled` (mission §3 : au moment de la première mutation
 * métier payante réelle, jamais lors d'un GET/preflight/readiness/simple affichage de bouton).
 *
 * Trois issues non-ambiguës, jamais une exception pour le cas nominal (l'appelant décide) :
 *   - `SUBSCRIPTION_COVERED` — abonnement ACTIVE/TRIALING : aucun Pass n'est requis, jamais consulté.
 *   - `ALREADY_ASSIGNED` — un Pass est déjà RESERVED ou CONSUMED pour CE Tender (mission §7 : un
 *     Tender déjà couvert continue de l'être, idempotent, jamais une seconde réservation).
 *   - `NEWLY_RESERVED` — un Pass AVAILABLE vient d'être atomiquement réservé pour CE Tender À
 *     L'INSTANT de cet appel (compare-and-set réel, voir `PassPurchaseRepository.reserveForTender`)
 *     — SEULE cette issue engage une éventuelle compensation (`ReleasePassForTenderUseCase`) si
 *     l'opération métier qui suit échoue (mission §4).
 *   - `DENIED` — ni abonnement, ni Pass déjà affecté, ni Pass disponible à réserver : l'appelant doit
 *     refuser l'opération (`TenderOperationNotEntitledError`).
 */
@Injectable()
export class ReservePassForTenderUseCase {
  constructor(
    @Inject(ORGANIZATION_SUBSCRIPTION_REPOSITORY) private readonly subscriptionRepository: OrganizationSubscriptionRepository,
    @Inject(PASS_PURCHASE_REPOSITORY) private readonly passPurchaseRepository: PassPurchaseRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
  ) {}

  async execute(
    command: ReservePassForTenderCommand,
  ): Promise<
    | Readonly<{ outcome: "SUBSCRIPTION_COVERED" }>
    | Readonly<{ outcome: "ALREADY_ASSIGNED"; passPurchaseId: string }>
    | Readonly<{ outcome: "NEWLY_RESERVED"; passPurchaseId: string }>
    | Readonly<{ outcome: "DENIED" }>
  > {
    const subscription = await this.subscriptionRepository.findByOrganizationId(command.organizationId);
    if (subscription && subscription.isEntitled) {
      return { outcome: "SUBSCRIPTION_COVERED" };
    }

    const alreadyAssigned = await this.passPurchaseRepository.findAssignedToTender(command.organizationId, command.tenderId);
    if (alreadyAssigned) {
      return { outcome: "ALREADY_ASSIGNED", passPurchaseId: alreadyAssigned.id };
    }

    const { applied, purchase } = await this.passPurchaseRepository.reserveForTender({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      now: command.occurredAt,
    });
    if (!applied || !purchase) {
      return { outcome: "DENIED" };
    }

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "PassReservedForTender",
      resourceType: "OrganizationPassPurchase",
      resourceId: purchase.id,
      metadata: { tenderId: command.tenderId },
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "PassReservedForTender",
          aggregateType: "OrganizationPassPurchase",
          aggregateId: purchase.id,
          payload: { tenderId: command.tenderId, actorId: command.actorId },
          occurredAt: command.occurredAt,
        },
      ],
    });

    return { outcome: "NEWLY_RESERVED", passPurchaseId: purchase.id };
  }
}
