import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { NOTIFICATION_REPOSITORY, type NotificationRepository } from "../ports/notification.repository";

export type MarkAllNotificationsReadCommand = Readonly<{ organizationId: string; userId: string }>;

@Injectable()
export class MarkAllNotificationsReadUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly repository: NotificationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: MarkAllNotificationsReadCommand): Promise<void> {
    await this.repository.markAllReadByUser({ organizationId: command.organizationId, userId: command.userId, occurredAt: this.clock.now() });
  }
}
