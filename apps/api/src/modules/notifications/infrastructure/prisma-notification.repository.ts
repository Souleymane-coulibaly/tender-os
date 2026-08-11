import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { Notification } from "../domain/notification.entity";
import type { NotificationPage, NotificationRepository } from "../application/ports/notification.repository";
import { toDomainNotification, toNotificationData } from "./notification.persistence-mapper";

@Injectable()
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(notification: Notification): Promise<void> {
    await this.prisma.currentClient().notification.create({ data: toNotificationData(notification) });
  }

  async save(notification: Notification): Promise<void> {
    await this.prisma.currentClient().notification.update({
      where: { id_organizationId: { id: notification.id, organizationId: notification.organizationId } },
      data: toNotificationData(notification),
    });
  }

  async findById(input: { organizationId: string; notificationId: string }): Promise<Notification | null> {
    const row = await this.prisma.currentClient().notification.findFirst({ where: { id: input.notificationId, organizationId: input.organizationId } });
    return row ? toDomainNotification(row) : null;
  }

  async listByUser(input: { organizationId: string; userId: string; unreadOnly?: boolean | undefined; cursor?: string | undefined; limit: number }): Promise<NotificationPage> {
    const rows = await this.prisma.currentClient().notification.findMany({
      where: { organizationId: input.organizationId, userId: input.userId, ...(input.unreadOnly ? { readAt: null } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    const hasNextPage = rows.length > input.limit;
    const page = hasNextPage ? rows.slice(0, input.limit) : rows;

    return { items: page.map(toDomainNotification), nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null };
  }

  async countUnreadByUser(input: { organizationId: string; userId: string }): Promise<number> {
    return this.prisma.currentClient().notification.count({ where: { organizationId: input.organizationId, userId: input.userId, readAt: null } });
  }

  async markAllReadByUser(input: { organizationId: string; userId: string; occurredAt: Date }): Promise<void> {
    await this.prisma.currentClient().notification.updateMany({
      where: { organizationId: input.organizationId, userId: input.userId, readAt: null },
      data: { readAt: input.occurredAt },
    });
  }
}
