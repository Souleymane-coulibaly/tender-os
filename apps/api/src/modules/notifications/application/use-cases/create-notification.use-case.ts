import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { Notification } from "../../domain/notification.entity";
import { NOTIFICATION_REPOSITORY, type NotificationRepository } from "../ports/notification.repository";

export type CreateNotificationCommand = Readonly<{
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | undefined;
  targetUrl?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Mission §37 — appelée par n'importe quel module producteur (market-watch aujourd'hui), jamais
 *  d'accès Prisma direct depuis l'appelant. */
@Injectable()
export class CreateNotificationUseCase {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly repository: NotificationRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CreateNotificationCommand): Promise<Notification> {
    const notification = Notification.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      userId: command.userId,
      type: command.type,
      title: command.title,
      body: command.body,
      targetUrl: command.targetUrl,
      metadata: command.metadata,
      occurredAt: this.clock.now(),
    });
    await this.repository.create(notification);
    return notification;
  }
}
