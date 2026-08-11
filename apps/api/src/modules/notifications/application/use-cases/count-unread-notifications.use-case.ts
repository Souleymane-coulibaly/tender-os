import { Inject, Injectable } from "@nestjs/common";
import { NOTIFICATION_REPOSITORY, type NotificationRepository } from "../ports/notification.repository";

export type CountUnreadNotificationsQuery = Readonly<{ organizationId: string; userId: string }>;

@Injectable()
export class CountUnreadNotificationsUseCase {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repository: NotificationRepository) {}

  async execute(query: CountUnreadNotificationsQuery): Promise<number> {
    return this.repository.countUnreadByUser(query);
  }
}
