import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { MEMBERSHIP_REPOSITORY, type MembershipRepository } from "../../../memberships";
import { assertHasTenderPermission, GetTenderUseCase, TenderPermission } from "../../../tenders";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { TenderParticipant, type TenderCollaborativeRole } from "../../domain/tender-participant.entity";
import { TenderActivityType } from "../../domain/tender-activity-type";
import {
  InvalidTenderParticipantCandidateError,
  TenderParticipantAlreadyActiveError,
  TenderParticipantBypassJustificationRequiredError,
} from "../../domain/errors";
import { assertWorkspaceAccess } from "../policies/workspace-authorization.policy";
import { resolveWorkspaceClientAccess } from "../policies/resolve-workspace-client-access.policy";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_PARTICIPANT_REPOSITORY, type TenderParticipantRepository } from "../ports/tender-participant.repository";
import { TenderActivityRecorderService } from "../services/tender-activity-recorder.service";
import { toTenderParticipantSummary, type TenderParticipantSummary } from "../dtos";

export type AddTenderParticipantCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  userId: string;
  role: TenderCollaborativeRole;
  justification?: string | undefined;
  requestId?: string | undefined;
}>;

/** V2 Sprint 7 §7 — SEUL endroit où l'appartenance organisation active ET l'accès à l'entreprise
 *  candidate du Tender sont vérifiés pour un candidat participant (Décision 2 du plan). Bypass
 *  administratif tracé (OWNER/ORGANIZATION_ADMIN uniquement) mirroré sur `resolveGoNoGoClientAccess`
 *  — jamais silencieux, toujours justifié et audité (mission §42). */
@Injectable()
export class AddTenderParticipantUseCase {
  constructor(
    @Inject(TENDER_PARTICIPANT_REPOSITORY) private readonly participantRepository: TenderParticipantRepository,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: MembershipRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly activityRecorder: TenderActivityRecorderService,
  ) {}

  async execute(command: AddTenderParticipantCommand): Promise<TenderParticipantSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageWorkspace);

    const tender = await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageWorkspace,
    });

    const existing = await this.participantRepository.findActiveByUser({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      userId: command.userId,
    });
    if (existing) {
      throw new TenderParticipantAlreadyActiveError();
    }

    const occurredAt = this.clock.now();

    const targetMembership = await this.membershipRepository.findByOrganizationAndUser({
      organizationId: command.organizationId,
      userId: command.userId,
    });
    if (!targetMembership || !targetMembership.isEffectivelyActive(occurredAt)) {
      throw new InvalidTenderParticipantCandidateError();
    }

    // Barre minimale : ReadWorkspace — un VIEWER (rôle client le plus bas ayant une capacité
    // Workspace) doit rester affectable, jamais exiger ManageWorkspace pour être simplement ajouté.
    const bypass = await resolveWorkspaceClientAccess({
      assertClientAccessUseCase: this.assertClientAccessUseCase,
      organizationId: command.organizationId,
      clientAccountId: tender.clientAccountId,
      targetUserId: command.userId,
      targetUserRole: targetMembership.role,
      actorRole: command.actorRole,
      permission: ClientPermission.ReadWorkspace,
    });
    if (bypass.viaAdminBypass && !command.justification?.trim()) {
      throw new TenderParticipantBypassJustificationRequiredError();
    }

    // Correctif audit Codex P1-02 — sauvegarde + AuditLog + TenderActivity + Outbox dans UNE SEULE
    // transaction Postgres (voir AssignTaskUseCase pour la justification complète).
    const participant = await this.atomicTransactionRunner.run(async () => {
      const participant = TenderParticipant.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        userId: command.userId,
        role: command.role,
        addedBy: command.actorId,
        occurredAt,
      });
      await this.participantRepository.save(participant);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "workspace.participant_added",
        resourceType: "tender_participant",
        resourceId: participant.id,
        requestId: command.requestId,
        metadata: {
          tenderId: command.tenderId,
          targetUserId: command.userId,
          role: command.role,
          ...(bypass.viaAdminBypass ? { clientAssignmentBypass: true, justification: command.justification } : {}),
        },
      });

      await this.activityRecorder.record({
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        actorId: command.actorId,
        type: TenderActivityType.ParticipantAdded,
        summary: `Participant ajouté (${command.role}).`,
        metadata: { participantId: participant.id, targetUserId: command.userId, role: command.role },
      });

      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: "TenderParticipantAdded",
            aggregateType: "TenderParticipant",
            aggregateId: participant.id,
            payload: { tenderId: command.tenderId, userId: command.userId, role: command.role },
            occurredAt,
          },
        ],
      });

      return participant;
    });

    return toTenderParticipantSummary(participant);
  }
}
