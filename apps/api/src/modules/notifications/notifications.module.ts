import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { CountUnreadNotificationsUseCase } from "./application/use-cases/count-unread-notifications.use-case";
import { CreateNotificationUseCase } from "./application/use-cases/create-notification.use-case";
import { ListNotificationsUseCase } from "./application/use-cases/list-notifications.use-case";
import { MarkAllNotificationsReadUseCase } from "./application/use-cases/mark-all-notifications-read.use-case";
import { MarkNotificationReadUseCase } from "./application/use-cases/mark-notification-read.use-case";
import { EMAIL_PROVIDER } from "./application/ports/email-provider";
import { NOTIFICATION_REPOSITORY } from "./application/ports/notification.repository";
import { LoggingEmailProvider } from "./infrastructure/email/logging-email.provider";
import { ResendEmailProvider } from "./infrastructure/email/resend-email.provider";
import { PrismaNotificationRepository } from "./infrastructure/prisma-notification.repository";
import { NotificationsController } from "./interfaces/http/notifications.controller";

/** Mission §37 — socle minimal, réutilisable par d'autres modules producteurs (market-watch,
 *  workspace) via `CreateNotificationUseCase`, jamais un accès Prisma direct depuis l'extérieur de
 *  ce module. `EMAIL_PROVIDER` (relocalisé ici depuis `market-watch` au Sprint 18 — mission §51/§100
 *  "ne pas créer un second pipeline email") bascule sur `ResendEmailProvider` UNIQUEMENT si
 *  `RESEND_API_KEY` est réellement présente au démarrage — sinon `LoggingEmailProvider`. */
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
    LoggingEmailProvider,
    ResendEmailProvider,
    { provide: EMAIL_PROVIDER, useClass: process.env.RESEND_API_KEY ? ResendEmailProvider : LoggingEmailProvider },
  ],
  exports: [CreateNotificationUseCase, EMAIL_PROVIDER],
})
export class NotificationsModule {}
