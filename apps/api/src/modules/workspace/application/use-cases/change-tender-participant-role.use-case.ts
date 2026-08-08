import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { assertHasTenderPermission, GetTenderUseCase, TenderPermission } from "../../../tenders";
import type { TenderCollaborativeRole } from "../../domain/tender-participant.entity";
import { TenderActivityType } from "../../domain/tender-activity-type";
import { TenderParticipantNotFoundError } from "../../domain/errors";
import { assertWorkspaceAccess } from "../policies/workspace-authorization.policy";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_PARTICIPANT_REPOSITORY, type TenderParticipantRepository } from "../ports/tender-participant.repository";
import { TenderActivityRecorderService } from "../services/tender-activity-recorder.service";
import { toTenderParticipantSummary, type TenderParticipantSummary } from "../dtos";

export type ChangeTenderParticipantRoleCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  participantId: string;
  actorId: string;
  actorRole: string;
  role: TenderCollaborativeRole;
  requestId?: string | undefined;
}>;

@Injectable()
export class ChangeTenderParticipantRoleUseCase {
  constructor(
    @Inject(TENDER_PARTICIPANT_REPOSITORY) private readonly participantRepository: TenderParticipantRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly activityRecorder: TenderActivityRecorderService,
  ) {}

  async execute(command: ChangeTenderParticipantRoleCommand): Promise<TenderParticipantSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageWorkspace);
    await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageWorkspace,
    });

    // Correctif audit Codex P1-02 — sauvegarde + AuditLog + TenderActivity dans UNE SEULE
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

      const previousRole = participant.role;
      const occurredAt = this.clock.now();
      participant.changeRole(command.role, occurredAt);
      await this.participantRepository.save(participant);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "workspace.participant_role_changed",
        resourceType: "tender_participant",
        resourceId: participant.id,
        requestId: command.requestId,
        metadata: { tenderId: command.tenderId, previousRole, newRole: command.role },
      });

      await this.activityRecorder.record({
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        actorId: command.actorId,
        type: TenderActivityType.ParticipantRoleChanged,
        summary: `Rôle changé : ${previousRole} → ${command.role}.`,
        metadata: { participantId: participant.id, previousRole, newRole: command.role },
      });

      return participant;
    });

    return toTenderParticipantSummary(participant);
  }
}
