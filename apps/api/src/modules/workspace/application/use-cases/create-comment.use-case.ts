import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { assertHasTenderPermission, CHECKLIST_ITEM_REPOSITORY, GetTenderUseCase, TenderPermission, type ChecklistItemRepository } from "../../../tenders";
import { OUTBOX_WRITER, type OutboxEventInput, type OutboxWriter } from "../../../outbox";
import { Comment, type CommentEntityType } from "../../domain/comment.entity";
import { Mention } from "../../domain/mention.entity";
import { TenderActivityType } from "../../domain/tender-activity-type";
import { InvalidMentionTargetError } from "../../domain/errors";
import { assertWorkspaceAccess } from "../policies/workspace-authorization.policy";
import { assertCommentEntityBelongsToTender } from "../services/comment-entity-resolver";
import { isActiveTenderParticipant } from "../services/participant-eligibility";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { COMMENT_REPOSITORY, type CommentRepository } from "../ports/comment.repository";
import { TASK_REPOSITORY, type TaskRepository } from "../ports/task.repository";
import { TENDER_PARTICIPANT_REPOSITORY, type TenderParticipantRepository } from "../ports/tender-participant.repository";
import { TenderActivityRecorderService } from "../services/tender-activity-recorder.service";
import { toCommentSummary, type CommentSummary } from "../dtos";

export type CreateCommentCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  entityType: CommentEntityType;
  entityId: string;
  body: string;
  /** Résolus côté frontend (autocomplete filtré, mission §23) — toujours des identifiants réels,
   *  jamais du texte libre "@Jean" parsé côté serveur. */
  mentionedUserIds?: readonly string[] | undefined;
  requestId?: string | undefined;
}>;

/** V2 Sprint 7 §47 — flux atomique : résout l'entité cible, valide CHAQUE mention AVANT toute
 *  écriture, puis persiste commentaire + mentions en une seule transaction Postgres
 *  (`CommentRepository.createWithMentions`). Si une mention est interdite (utilisateur non
 *  participant actif de ce Tender), la création ENTIÈRE est refusée — jamais un commentaire créé
 *  avec une mention silencieusement abandonnée, jamais un utilisateur sans accès notifié (mission
 *  §23/§47 "préférence : refuser proprement"). */
@Injectable()
export class CreateCommentUseCase {
  constructor(
    @Inject(COMMENT_REPOSITORY) private readonly commentRepository: CommentRepository,
    @Inject(TASK_REPOSITORY) private readonly taskRepository: TaskRepository,
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistItemRepository: ChecklistItemRepository,
    @Inject(TENDER_PARTICIPANT_REPOSITORY) private readonly participantRepository: TenderParticipantRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly activityRecorder: TenderActivityRecorderService,
  ) {}

  async execute(command: CreateCommentCommand): Promise<CommentSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageWorkspace);
    await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageWorkspace,
    });

    await assertCommentEntityBelongsToTender(
      { checklistItemRepository: this.checklistItemRepository, taskRepository: this.taskRepository },
      { organizationId: command.organizationId, tenderId: command.tenderId, entityType: command.entityType, entityId: command.entityId },
    );

    const mentionedUserIds = [...new Set(command.mentionedUserIds ?? [])];
    for (const mentionedUserId of mentionedUserIds) {
      const eligible = await isActiveTenderParticipant(this.participantRepository, {
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        userId: mentionedUserId,
      });
      if (!eligible) {
        throw new InvalidMentionTargetError();
      }
    }

    // Correctif audit Codex P1-02 — commentaire + mentions + AuditLog + TenderActivity + Outbox
    // dans UNE SEULE transaction Postgres, jamais un commentaire persisté sans sa trace d'audit/
    // activité/notification si une étape ultérieure échoue.
    const { comment, mentions } = await this.atomicTransactionRunner.run(async () => {
      const occurredAt = this.clock.now();
      const comment = Comment.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        entityType: command.entityType,
        entityId: command.entityId,
        authorId: command.actorId,
        body: command.body,
        occurredAt,
      });
      const mentions = mentionedUserIds.map((mentionedUserId) =>
        Mention.create({ id: this.idGenerator.generate(), organizationId: command.organizationId, commentId: comment.id, mentionedUserId, occurredAt }),
      );
      await this.commentRepository.createWithMentions(comment, mentions);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "workspace.comment_added",
        resourceType: "comment",
        resourceId: comment.id,
        requestId: command.requestId,
        metadata: { tenderId: command.tenderId, entityType: command.entityType, entityId: command.entityId, mentionCount: mentions.length },
      });

      await this.activityRecorder.record({
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        actorId: command.actorId,
        type: TenderActivityType.CommentAdded,
        summary: `Commentaire ajouté sur ${command.entityType.toLowerCase()}.`,
        metadata: { commentId: comment.id, entityType: command.entityType, entityId: command.entityId },
      });

      const events: OutboxEventInput[] = [
        {
          eventType: "CommentAdded",
          aggregateType: "Comment",
          aggregateId: comment.id,
          payload: { tenderId: command.tenderId, entityType: command.entityType, entityId: command.entityId },
          occurredAt,
        },
      ];
      for (const mention of mentions) {
        events.push({
          eventType: "UserMentioned",
          aggregateType: "Mention",
          aggregateId: mention.id,
          payload: { tenderId: command.tenderId, commentId: comment.id, mentionedUserId: mention.mentionedUserId },
          occurredAt,
        });
        await this.activityRecorder.record({
          organizationId: command.organizationId,
          tenderId: command.tenderId,
          actorId: command.actorId,
          type: TenderActivityType.UserMentioned,
          summary: "Un utilisateur a été mentionné.",
          metadata: { commentId: comment.id, mentionedUserId: mention.mentionedUserId },
        });
      }
      await this.outboxWriter.write({ organizationId: command.organizationId, events });

      return { comment, mentions };
    });

    return toCommentSummary(comment, mentions);
  }
}
