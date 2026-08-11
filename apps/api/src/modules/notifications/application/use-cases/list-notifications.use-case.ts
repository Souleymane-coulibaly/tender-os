import { Inject, Injectable } from "@nestjs/common";
import { NOTIFICATION_REPOSITORY, type NotificationPage, type NotificationRepository } from "../ports/notification.repository";

export type ListNotificationsQuery = Readonly<{ organizationId: string; userId: string; unreadOnly?: boolean | undefined; cursor?: string | undefined; limit: number }>;

/** Mission — un utilisateur ne voit jamais que SES PROPRES notifications, jamais un filtre RBAC :
 *  l'identité (`userId` == acteur courant) est l'unique périmètre. */
@Injectable()
export class ListNotificationsUseCase {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repository: NotificationRepository) {}

  async execute(query: ListNotificationsQuery): Promise<NotificationPage> {
    return this.repository.listByUser(query);
  }
}
