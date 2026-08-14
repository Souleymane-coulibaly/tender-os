import { Inject, Injectable } from "@nestjs/common";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { PassPurchaseAlreadyConsumedError, PassPurchaseNotFoundError } from "../../domain/errors";
import { PassPurchaseStatus } from "../../domain/pass-purchase-status";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { PASS_PURCHASE_REPOSITORY, type PassPurchaseRepository } from "../ports/pass-purchase.repository";

export type ConsumePassForTenderCommand = Readonly<{
  organizationId: string;
  passPurchaseId: string;
  tenderId: string;
  actorId: string;
  occurredAt: Date;
}>;

/**
 * V2 Sprint 22 (billing, étape 22A) — QUAND appeler ce use case (achat avec Tender déjà choisi au
 * checkout, ou premier import DCE d'un Tender par une organisation sans abonnement actif) n'est PAS
 * tranché ici : ce point d'ambiguïté est explicitement reporté à 22B/22C (voir le rapport 22A), ce
 * use case n'est que le mécanisme d'attachement atomique et idempotent, réutilisable quel que soit
 * le déclencheur retenu.
 */
@Injectable()
export class ConsumePassForTenderUseCase {
  constructor(
    @Inject(PASS_PURCHASE_REPOSITORY) private readonly passPurchaseRepository: PassPurchaseRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
  ) {}

  async execute(command: ConsumePassForTenderCommand): Promise<void> {
    const existing = await this.passPurchaseRepository.findById(command.organizationId, command.passPurchaseId);
    if (!existing) {
      throw new PassPurchaseNotFoundError(command.passPurchaseId);
    }
    if (existing.status === PassPurchaseStatus.Consumed && existing.consumedTenderId !== command.tenderId) {
      throw new PassPurchaseAlreadyConsumedError(existing.id, existing.consumedTenderId ?? "unknown");
    }
    if (existing.status === PassPurchaseStatus.Consumed && existing.consumedTenderId === command.tenderId) {
      return;
    }

    const { applied, purchase } = await this.passPurchaseRepository.consumeForTender({
      organizationId: command.organizationId,
      passPurchaseId: command.passPurchaseId,
      tenderId: command.tenderId,
      occurredAt: command.occurredAt,
    });

    if (!applied) {
      // Course perdue face à une autre requête concurrente (compare-and-set côté SQL) : jamais une
      // régression, la ligne réelle en base fait foi.
      const current = purchase ?? (await this.passPurchaseRepository.findById(command.organizationId, command.passPurchaseId));
      if (current?.status === PassPurchaseStatus.Consumed && current.consumedTenderId !== command.tenderId) {
        throw new PassPurchaseAlreadyConsumedError(current.id, current.consumedTenderId ?? "unknown");
      }
      return;
    }

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "PassConsumed",
      resourceType: "OrganizationPassPurchase",
      resourceId: command.passPurchaseId,
      metadata: { tenderId: command.tenderId },
    });

    // Mission §53 "Après affectation : Votre Pass AO est maintenant associé à [Tender]" — contrairement
    // aux événements webhook (aucun acteur), `command.actorId` est ICI un utilisateur réel (celui qui
    // a déclenché la création du Tender) : notifié directement, jamais l'ensemble OWNER/ADMIN.
    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "PassConsumedForTender",
          aggregateType: "OrganizationPassPurchase",
          aggregateId: command.passPurchaseId,
          payload: { tenderId: command.tenderId, actorId: command.actorId },
          occurredAt: command.occurredAt,
        },
      ],
    });
  }
}
