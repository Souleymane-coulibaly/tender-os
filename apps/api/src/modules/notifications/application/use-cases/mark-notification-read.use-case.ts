import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { NotificationNotFoundError } from "../../domain/errors";
import { NOTIFICATION_REPOSITORY, type NotificationRepository } from "../ports/notification.repository";

export type MarkNotificationReadCommand = Readonly<{ organizationId: string; userId: string; notificationId: string }>;

@Injectable()
export class MarkNotificationReadUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly repository: NotificationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: MarkNotificationReadCommand): Promise<void> {
    const notification = await this.repository.findById({ organizationId: command.organizationId, notificationId: command.notificationId });
    // Anti-IDOR : une notification d'un autre utilisateur répond exactement comme si elle
    // n'existait pas, jamais un 403 qui confirmerait son existence.
    if (!notification || notification.userId !== command.userId) {
      throw new NotificationNotFoundError();
    }
    notification.markRead(this.clock.now());
    await this.repository.save(notification);
  }
}
