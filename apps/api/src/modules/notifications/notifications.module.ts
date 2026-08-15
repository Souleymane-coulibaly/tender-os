import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { CountUnreadNotificationsUseCase } from "./application/use-cases/count-unread-notifications.use-case";
import { CreateNotificationUseCase } from "./application/use-cases/create-notification.use-case";
import { ListNotificationsUseCase } from "./application/use-cases/list-notifications.use-case";
import { MarkAllNotificationsReadUseCase } from "./application/use-cases/mark-all-notifications-read.use-case";
import { MarkNotificationReadUseCase } from "./application/use-cases/mark-notification-read.use-case";
import { NOTIFICATION_REPOSITORY } from "./application/ports/notification.repository";
import { PrismaNotificationRepository } from "./infrastructure/prisma-notification.repository";
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
    { provide: NOTIFICATION_REPOSITORY, useClass: PrismaNotificationRepository },
  ],
  exports: [CreateNotificationUseCase],
})
export class NotificationsModule {}
