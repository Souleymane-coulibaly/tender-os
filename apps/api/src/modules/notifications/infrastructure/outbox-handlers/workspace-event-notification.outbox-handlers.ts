import { Injectable } from "@nestjs/common";
import type { OutboxEventHandler, OutboxEventToDispatch } from "../../../outbox";
import {
  buildApprovalDecisionEmail,
  buildApprovalRequestedEmail,
  buildMentionEmail,
  buildTaskAssignedEmail,
} from "./workspace-notification-templates";
import { WorkspaceEventNotificationService } from "./workspace-event-notification.service";

function baseUrl(): string {
  return process.env.APP_BASE_URL ?? "http://localhost:3000";
}

function workspaceLink(tenderId: string): string {
  return `${baseUrl()}/app/tenders/${tenderId}/workspace`;
}

function validationLink(approvalId: string): string {
  return `${baseUrl()}/app/validations?approvalId=${approvalId}`;
}

/** Mission §16 "pas de spam de mention" — chacun de ces handlers ne réagit qu'à un événement
 *  précis créé UNE FOIS par son use case d'origine (mission §97 "une action ne doit pas créer 5
 *  notifications identiques") : éditer un commentaire sans ajouter de mention n'émet aucun nouvel
 *  événement `UserMentioned` (voir `CreateCommentUseCase`/`EditCommentUseCase`), donc aucune
 *  notification renvoyée. */
@Injectable()
export class UserMentionedNotificationOutboxHandler implements OutboxEventHandler {
  readonly eventType = "UserMentioned";
  constructor(private readonly service: WorkspaceEventNotificationService) {}

  async handle(event: OutboxEventToDispatch): Promise<void> {
    const payload = event.payload as { tenderId?: unknown; mentionedUserId?: unknown };
    if (typeof payload.tenderId !== "string" || typeof payload.mentionedUserId !== "string") return;
    const link = workspaceLink(payload.tenderId);
    const email = buildMentionEmail(link);
    await this.service.notifyUser({
      organizationId: event.organizationId,
      userId: payload.mentionedUserId,
      type: "WORKSPACE_MENTION",
      title: "Vous avez été mentionné",
      targetUrl: link,
      metadata: { tenderId: payload.tenderId, commentId: event.aggregateId },
      emailSubject: email.subject,
      emailHtml: email.html,
      emailText: email.text,
    });
  }
}

@Injectable()
export class TaskAssignedNotificationOutboxHandler implements OutboxEventHandler {
  readonly eventType = "TaskAssigned";
  constructor(private readonly service: WorkspaceEventNotificationService) {}

  async handle(event: OutboxEventToDispatch): Promise<void> {
    const payload = event.payload as { tenderId?: unknown; assigneeId?: unknown };
    // Une désassignation (`assigneeId: undefined`) n'émet jamais de notification.
    if (typeof payload.tenderId !== "string" || typeof payload.assigneeId !== "string") return;
    const link = workspaceLink(payload.tenderId);
    const email = buildTaskAssignedEmail(link);
    await this.service.notifyUser({
      organizationId: event.organizationId,
      userId: payload.assigneeId,
      type: "WORKSPACE_TASK_ASSIGNED",
      title: "Une tâche vous a été assignée",
      targetUrl: link,
      metadata: { tenderId: payload.tenderId, taskId: event.aggregateId },
      emailSubject: email.subject,
      emailHtml: email.html,
      emailText: email.text,
    });
  }
}

@Injectable()
export class ApprovalRequestedNotificationOutboxHandler implements OutboxEventHandler {
  readonly eventType = "ApprovalRequested";
  constructor(private readonly service: WorkspaceEventNotificationService) {}

  async handle(event: OutboxEventToDispatch): Promise<void> {
    const payload = event.payload as { tenderId?: unknown; entityType?: unknown; entityId?: unknown; reviewerId?: unknown };
    if (typeof payload.tenderId !== "string" || typeof payload.entityType !== "string" || typeof payload.reviewerId !== "string") return;
    const link = validationLink(event.aggregateId);
    const email = buildApprovalRequestedEmail(payload.entityType, link);
    await this.service.notifyUser({
      organizationId: event.organizationId,
      userId: payload.reviewerId,
      type: "WORKSPACE_APPROVAL_REQUESTED",
      title: "Une validation vous est demandée",
      targetUrl: link,
      metadata: { tenderId: payload.tenderId, approvalId: event.aggregateId, entityType: payload.entityType, entityId: payload.entityId },
      emailSubject: email.subject,
      emailHtml: email.html,
      emailText: email.text,
    });
  }
}

/** Les trois décisions (approve/changes-requested/reject) partagent la même forme de payload
 *  (`requestedBy`, mission §50 "Approved/Rejected → requester notified") — trois classes explicites
 *  plutôt qu'une fabrique générique, même discipline que le reste de ce dépôt ("copie exacte,
 *  volontairement répétée" — un mixin/fabrique de classe décorée `@Injectable()` est fragile vis-à-
 *  vis des métadonnées de constructeur NestJS). */
async function handleApprovalDecision(
  service: WorkspaceEventNotificationService,
  event: OutboxEventToDispatch,
  outcome: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED",
  notificationType: string,
  title: string,
): Promise<void> {
  const payload = event.payload as { tenderId?: unknown; entityType?: unknown; entityId?: unknown; requestedBy?: unknown };
  if (typeof payload.tenderId !== "string" || typeof payload.entityType !== "string" || typeof payload.requestedBy !== "string") return;
  const link = validationLink(event.aggregateId);
  const email = buildApprovalDecisionEmail(outcome, payload.entityType, link);
  await service.notifyUser({
    organizationId: event.organizationId,
    userId: payload.requestedBy,
    type: notificationType,
    title,
    targetUrl: link,
    metadata: { tenderId: payload.tenderId, approvalId: event.aggregateId, entityType: payload.entityType, entityId: payload.entityId },
    emailSubject: email.subject,
    emailHtml: email.html,
    emailText: email.text,
  });
}

@Injectable()
export class ApprovalApprovedNotificationOutboxHandler implements OutboxEventHandler {
  readonly eventType = "ApprovalApproved";
  constructor(private readonly service: WorkspaceEventNotificationService) {}
  handle(event: OutboxEventToDispatch): Promise<void> {
    return handleApprovalDecision(this.service, event, "APPROVED", "WORKSPACE_APPROVAL_APPROVED", "Votre demande a été approuvée");
  }
}

@Injectable()
export class ApprovalChangesRequestedNotificationOutboxHandler implements OutboxEventHandler {
  readonly eventType = "ApprovalChangesRequested";
  constructor(private readonly service: WorkspaceEventNotificationService) {}
  handle(event: OutboxEventToDispatch): Promise<void> {
    return handleApprovalDecision(this.service, event, "CHANGES_REQUESTED", "WORKSPACE_APPROVAL_CHANGES_REQUESTED", "Modifications demandées sur votre demande");
  }
}

@Injectable()
export class ApprovalRejectedNotificationOutboxHandler implements OutboxEventHandler {
  readonly eventType = "ApprovalRejected";
  constructor(private readonly service: WorkspaceEventNotificationService) {}
  handle(event: OutboxEventToDispatch): Promise<void> {
    return handleApprovalDecision(this.service, event, "REJECTED", "WORKSPACE_APPROVAL_REJECTED", "Votre demande a été rejetée");
  }
}
