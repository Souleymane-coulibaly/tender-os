export { NotificationsModule } from "./notifications.module";
export { CreateNotificationUseCase, type CreateNotificationCommand } from "./application/use-cases/create-notification.use-case";
export { EMAIL_PROVIDER, type EmailProvider, type EmailMessage } from "./application/ports/email-provider";

// V2 Sprint 18 — réexporté UNIQUEMENT pour `app.module.ts` (`OutboxModule.forRoot`, point
// d'assemblage unique des handlers Outbox de toute l'application, mission §98, même motif que
// `IntegrationEventConsumersModule`/`INTEGRATION_OUTBOX_HANDLERS`, Sprint 16).
export { NotificationEventConsumersModule, NOTIFICATION_OUTBOX_HANDLERS } from "./notification-event-consumers.module";
