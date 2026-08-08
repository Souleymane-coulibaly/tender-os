import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { assertHasTenderPermission, GetTenderUseCase, TenderPermission } from "../../../tenders";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { TenderActivityType } from "../../domain/tender-activity-type";
import { TenderParticipantNotFoundError } from "../../domain/errors";
import { assertWorkspaceAccess } from "../policies/workspace-authorization.policy";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_PARTICIPANT_REPOSITORY, type TenderParticipantRepository } from "../ports/tender-participant.repository";
import { TenderActivityRecorderService } from "../services/tender-activity-recorder.service";
import { toTenderParticipantSummary, type TenderParticipantSummary } from "../dtos";

export type RemoveTenderParticipantCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  participantId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/** V2 Sprint 7 §49 — retrait toujours "soft" : les tâches déjà assignées à ce participant restent
 *  assignées telles quelles (mission : "ne jamais supprimer ses tâches" ; conserver l'historique).
 *  Une réaffectation explicite reste possible ensuite via `AssignTaskUseCase`, mais rien
 *  d'automatique ici — jamais une désassignation en cascade non demandée. */
@Injectable()
export class RemoveTenderParticipantUseCase {
  constructor(
    @Inject(TENDER_PARTICIPANT_REPOSITORY) private readonly participantRepository: TenderParticipantRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly activityRecorder: TenderActivityRecorderService,
  ) {}

  async execute(command: RemoveTenderParticipantCommand): Promise<TenderParticipantSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageWorkspace);
    await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageWorkspace,
    });

    // Correctif audit Codex P1-02 — sauvegarde + AuditLog + TenderActivity + Outbox dans UNE SEULE
    // transaction Postgres (voir AssignTaskUseCase pour la justification complète).
    const participant = await this.atomicTransactionRunner.run(async () => {
      const participant = await this.participantRepository.findById({
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        participantId: command.participantId,
      });
      if (!participant || !participant.isActive) {
        throw new TenderParticipantNotFoundError();
      }

      const occurredAt = this.clock.now();
      participant.remove(command.actorId, occurredAt);
      await this.participantRepository.save(participant);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "workspace.participant_removed",
        resourceType: "tender_participant",
        resourceId: participant.id,
        requestId: command.requestId,
        metadata: { tenderId: command.tenderId, targetUserId: participant.userId },
      });

      await this.activityRecorder.record({
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        actorId: command.actorId,
        type: TenderActivityType.ParticipantRemoved,
        summary: "Un participant a été retiré du Tender.",
        metadata: { participantId: participant.id, targetUserId: participant.userId },
      });

      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: "TenderParticipantRemoved",
            aggregateType: "TenderParticipant",
            aggregateId: participant.id,
            payload: { tenderId: command.tenderId, userId: participant.userId },
            occurredAt,
          },
        ],
      });

      return participant;
    });

    return toTenderParticipantSummary(participant);
  }
}
