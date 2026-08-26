export { NotificationsModule } from "./notifications.module";
export { CreateNotificationUseCase, type CreateNotificationCommand } from "./application/use-cases/create-notification.use-case";
// Checkpoint TENDEROS-2.1-P2.3-E11 — réexportés UNIQUEMENT pour `market-watch`
// (`SendPendingEmailAlertsUseCase`), même motif que `CreateNotificationUseCase` ci-dessus.
export { IsCategoryEmailEnabledUseCase } from "./application/use-cases/is-category-email-enabled.use-case";
export { NotificationCategory } from "./domain/notification-category";
// EMAIL_PROVIDER a déménagé vers shared-kernel/email-provider.ts au V2 Sprint 24 — voir ce
// fichier pour le pourquoi. Ne plus jamais le réexporter ici (le point d'entrée canonique est
// désormais le Shared Kernel, disponible partout via SharedKernelModule sans import explicite).

// V2 Sprint 18 — réexporté UNIQUEMENT pour `app.module.ts` (`OutboxModule.forRoot`, point
// d'assemblage unique des handlers Outbox de toute l'application, mission §98, même motif que
// `IntegrationEventConsumersModule`/`INTEGRATION_OUTBOX_HANDLERS`, Sprint 16).
export { NotificationEventConsumersModule, NOTIFICATION_OUTBOX_HANDLERS } from "./notification-event-consumers.module";
