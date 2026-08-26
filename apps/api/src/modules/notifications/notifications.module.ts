import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { CountUnreadNotificationsUseCase } from "./application/use-cases/count-unread-notifications.use-case";
import { CreateNotificationUseCase } from "./application/use-cases/create-notification.use-case";
import { GetNotificationPreferencesUseCase } from "./application/use-cases/get-notification-preferences.use-case";
import { IsCategoryEmailEnabledUseCase } from "./application/use-cases/is-category-email-enabled.use-case";
import { ListNotificationsUseCase } from "./application/use-cases/list-notifications.use-case";
import { MarkAllNotificationsReadUseCase } from "./application/use-cases/mark-all-notifications-read.use-case";
import { MarkNotificationReadUseCase } from "./application/use-cases/mark-notification-read.use-case";
import { UpdateNotificationPreferenceUseCase } from "./application/use-cases/update-notification-preference.use-case";
import { NOTIFICATION_REPOSITORY } from "./application/ports/notification.repository";
import { NOTIFICATION_PREFERENCE_REPOSITORY } from "./application/ports/notification-preference.repository";
import { PrismaNotificationRepository } from "./infrastructure/prisma-notification.repository";
import { PrismaNotificationPreferenceRepository } from "./infrastructure/prisma-notification-preference.repository";
import { NotificationsController } from "./interfaces/http/notifications.controller";

/** Mission §37 — socle minimal, réutilisable par d'autres modules producteurs (market-watch,
 *  workspace) via `CreateNotificationUseCase`, jamais un accès Prisma direct depuis l'extérieur de
 *  ce module. `EMAIL_PROVIDER` a déménagé vers `shared-kernel` au V2 Sprint 24 (voir
 *  shared-kernel/email-provider.ts pour le pourquoi — `identity` en a besoin sans pouvoir
 *  dépendre de ce module) : disponible partout via `SharedKernelModule` (`@Global()`), plus
 *  fourni ni réexporté ici. */
@Module({
  imports: [IdentityModule, MembershipsModule],
  controllers: [NotificationsController],
  providers: [
    CreateNotificationUseCase,
    ListNotificationsUseCase,
    CountUnreadNotificationsUseCase,
    MarkNotificationReadUseCase,
    MarkAllNotificationsReadUseCase,
    GetNotificationPreferencesUseCase,
    UpdateNotificationPreferenceUseCase,
    IsCategoryEmailEnabledUseCase,
    { provide: NOTIFICATION_REPOSITORY, useClass: PrismaNotificationRepository },
    { provide: NOTIFICATION_PREFERENCE_REPOSITORY, useClass: PrismaNotificationPreferenceRepository },
  ],
  // Checkpoint TENDEROS-2.1-P2.3-E11 — `IsCategoryEmailEnabledUseCase` réexporté UNIQUEMENT pour
  // `market-watch` (déjà importateur de ce module, voir `market-watch.module.ts`), qui a son propre
  // pipeline email (`SendPendingEmailAlertsUseCase`) hors de ce module. `WorkspaceEventNotificationService`/
  // `BillingEventNotificationService` vivent DANS ce module, l'injectent directement sans export.
  exports: [CreateNotificationUseCase, IsCategoryEmailEnabledUseCase],
})
export class NotificationsModule {}
