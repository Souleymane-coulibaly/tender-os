import { Inject, Injectable } from "@nestjs/common";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { PassPurchaseStatus } from "../../domain/pass-purchase-status";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { PASS_PURCHASE_REPOSITORY, type PassPurchaseRepository } from "../ports/pass-purchase.repository";

export type ReleasePassForTenderReason = "OPERATION_FAILED" | "MANUAL_RELEASE";

export type ReleasePassForTenderCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  passPurchaseId: string;
  actorId: string;
  occurredAt: Date;
  reason: ReleasePassForTenderReason;
}>;

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1.3 — mission §4 (ÉCHEC D'OPÉRATION, Option B "compensation/release
 * sûre et idempotente") et §5 (RELEASE PASS). Libère un Pass RESERVED pour repasser AVAILABLE —
 * SEUL appelant nominal aujourd'hui : `EntitlementService.runTenderOperationEntitled`, quand la
 * mutation métier qui a suivi une réservation FRAÎCHEMENT créée (`NEWLY_RESERVED`, jamais un Pass
 * déjà assigné par un appel précédent) échoue — jamais un try/catch silencieux : l'échec original est
 * toujours re-propagé par l'appelant après cette libération (mission §4 "ne jamais utiliser un
 * try/catch silencieux").
 *
 * Idempotent et tenant-safe par construction (voir `PassPurchaseRepository.releaseReservation`) :
 * `applied: false` — jamais une exception — si le Pass n'est plus RESERVED pour CE Tender au moment
 * de l'appel (déjà libéré, ou déjà CONSUMED entre-temps par une consommation concurrente légitime,
 * mission §10 TEST 3/TEST 4 "reserve concurrent avec release/consume") : dans ce dernier cas, la
 * libération est un no-op silencieux, JAMAIS une régression du Pass déjà consommé — la clause SQL
 * `WHERE status = 'RESERVED'` rend cette situation structurellement impossible à corrompre (mission
 * §5 "libération impossible après CONSUMED").
 *
 * `reason` distingue deux origines auditées séparément (mission §5 "auditée") : `OPERATION_FAILED`
 * (compensation automatique) vs. `MANUAL_RELEASE` (Checkpoint TENDEROS-2.1-P2.3-E1.4 — déclenchement
 * EXPLICITE via `AbandonTenderUseCase`, voir `releaseForTenderIfReserved` ci-dessous).
 */
@Injectable()
export class ReleasePassForTenderUseCase {
  constructor(
    @Inject(PASS_PURCHASE_REPOSITORY) private readonly passPurchaseRepository: PassPurchaseRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
  ) {}

  /**
   * Checkpoint TENDEROS-2.1-P2.3-E1.4, mission §7/§8/§9 (ABANDON EXPLICITE) — point d'entrée dédié
   * pour un déclenchement VOLONTAIRE (mission "action explicite d'abandon"), qui ne connaît PAS
   * encore quel `passPurchaseId` (le cas échéant) est concerné pour ce Tender — contrairement à
   * `execute()` ci-dessus (appelé par `runTenderOperationEntitled`, qui connaît déjà l'id exact
   * depuis sa propre réservation fraîche). Résout d'abord le Pass affecté à CE Tender
   * (`findAssignedToTender`, la MÊME autorité de lecture que `EntitlementService`, jamais une
   * seconde requête ad hoc), puis applique la même politique EXACTE que `execute()` :
   *   - aucun Pass affecté (couverture par abonnement, ou jamais de Pass réservé) -> no-op explicite,
   *     jamais une erreur (mission §10 "abandon doit fonctionner normalement sans modifier le
   *     ledger AO") ;
   *   - Pass déjà CONSUMED pour ce Tender -> JAMAIS touché (mission §9 "ne jamais toucher un Pass
   *     CONSUMED", §12 "aucun remboursement automatique après dépôt") — structurellement impossible
   *     de toute façon via `releaseReservation` (clause SQL `WHERE status = 'RESERVED'`), mais vérifié
   *     ICI explicitement pour ne même pas tenter l'appel et pour retourner un statut clair à
   *     l'appelant ;
   *   - Pass RESERVED pour ce Tender -> libéré via `execute()`, jamais un second chemin de mutation.
   */
  async releaseForTenderIfReserved(
    command: Readonly<{ organizationId: string; tenderId: string; actorId: string; occurredAt: Date }>,
  ): Promise<Readonly<{ outcome: "NO_PASS_ASSIGNED" | "ALREADY_CONSUMED" | "RELEASED" | "NOT_RELEASED" }>> {
    const assigned = await this.passPurchaseRepository.findAssignedToTender(command.organizationId, command.tenderId);
    if (!assigned) {
      return { outcome: "NO_PASS_ASSIGNED" };
    }
    if (assigned.status === PassPurchaseStatus.Consumed) {
      return { outcome: "ALREADY_CONSUMED" };
    }

    const { applied } = await this.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      passPurchaseId: assigned.id,
      actorId: command.actorId,
      occurredAt: command.occurredAt,
      reason: "MANUAL_RELEASE",
    });
    return { outcome: applied ? "RELEASED" : "NOT_RELEASED" };
  }

  async execute(command: ReleasePassForTenderCommand): Promise<{ applied: boolean }> {
    const { applied } = await this.passPurchaseRepository.releaseReservation({
      organizationId: command.organizationId,
      passPurchaseId: command.passPurchaseId,
      tenderId: command.tenderId,
      occurredAt: command.occurredAt,
    });

    if (!applied) {
      return { applied: false };
    }

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "PassReservationReleased",
      resourceType: "OrganizationPassPurchase",
      resourceId: command.passPurchaseId,
      metadata: { tenderId: command.tenderId, reason: command.reason },
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "PassReservationReleased",
          aggregateType: "OrganizationPassPurchase",
          aggregateId: command.passPurchaseId,
          payload: { tenderId: command.tenderId, actorId: command.actorId, reason: command.reason },
          occurredAt: command.occurredAt,
        },
      ],
    });

    return { applied: true };
  }
}
