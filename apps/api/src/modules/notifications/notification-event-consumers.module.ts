import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { ApprovalApprovedNotificationOutboxHandler } from "./infrastructure/outbox-handlers/workspace-event-notification.outbox-handlers";
import { ApprovalChangesRequestedNotificationOutboxHandler } from "./infrastructure/outbox-handlers/workspace-event-notification.outbox-handlers";
import { ApprovalRejectedNotificationOutboxHandler } from "./infrastructure/outbox-handlers/workspace-event-notification.outbox-handlers";
import { ApprovalRequestedNotificationOutboxHandler } from "./infrastructure/outbox-handlers/workspace-event-notification.outbox-handlers";
import { TaskAssignedNotificationOutboxHandler } from "./infrastructure/outbox-handlers/workspace-event-notification.outbox-handlers";
import { UserMentionedNotificationOutboxHandler } from "./infrastructure/outbox-handlers/workspace-event-notification.outbox-handlers";
import { WorkspaceEventNotificationService } from "./infrastructure/outbox-handlers/workspace-event-notification.service";
import { NotificationsModule } from "./notifications.module";

/** Les handlers Outbox réellement enregistrés pour ce module (mission Sprint 18 §15/§21/§50/§51,
 *  même motif que `INTEGRATION_OUTBOX_HANDLERS`, Sprint 16). Les 6 types d'événements consommés ici
 *  (`UserMentioned`/`TaskAssigned`/`ApprovalRequested`/`ApprovalApproved`/`ApprovalChangesRequested`/
 *  `ApprovalRejected`) sont déjà écrits par `workspace` depuis Sprint 7/18 — AUCUN handler n'était
 *  enregistré dessus jusqu'ici (confirmé par audit), donc aucun risque de collision avec
 *  `INTEGRATION_OUTBOX_HANDLERS` (`CompositeOutboxEventDispatcher` n'admet qu'UN SEUL handler par
 *  `eventType`, voir ce fichier). */
export const NOTIFICATION_OUTBOX_HANDLERS = [
  UserMentionedNotificationOutboxHandler,
  TaskAssignedNotificationOutboxHandler,
  ApprovalRequestedNotificationOutboxHandler,
  ApprovalApprovedNotificationOutboxHandler,
  ApprovalChangesRequestedNotificationOutboxHandler,
  ApprovalRejectedNotificationOutboxHandler,
];

/**
 * V2 Sprint 18 — module MINIMAL et AUTONOME, même motif que `IntegrationEventConsumersModule`
 * (Sprint 16) : uniquement pour être importé par `OutboxModule.forRoot(...)` (app.module.ts) sans
 * créer de cycle. `NotificationsModule` n'importe ni `OutboxModule` ni `OutboxWriterModule` — aucun
 * risque de boucle `OutboxModule -> ... -> OutboxModule`. `workspace`, lui, importe déjà
 * `OutboxWriterModule` (producteur), jamais ce module-ci (consommateur) : sens unique, comme tous
 * les producteurs/consommateurs Outbox de ce dépôt depuis le correctif Sprint 16.
 */
@Module({
  imports: [NotificationsModule, IdentityModule],
  providers: [WorkspaceEventNotificationService, ...NOTIFICATION_OUTBOX_HANDLERS],
  exports: [WorkspaceEventNotificationService, ...NOTIFICATION_OUTBOX_HANDLERS],
})
export class NotificationEventConsumersModule {}
