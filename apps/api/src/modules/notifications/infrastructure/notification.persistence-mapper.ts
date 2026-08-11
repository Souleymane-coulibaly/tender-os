import { Prisma, type Notification as PrismaNotification } from "@prisma/client";
import { Notification } from "../domain/notification.entity";

export function toDomainNotification(row: PrismaNotification): Notification {
  return Notification.rehydrate({
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    type: row.type,
    title: row.title,
    body: row.body ?? undefined,
    targetUrl: row.targetUrl ?? undefined,
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
    readAt: row.readAt ?? undefined,
    createdAt: row.createdAt,
  });
}

export function toNotificationData(notification: Notification) {
  return {
    id: notification.id,
    organizationId: notification.organizationId,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    body: notification.body ?? null,
    targetUrl: notification.targetUrl ?? null,
    metadata: notification.metadata ? (notification.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
    readAt: notification.readAt ?? null,
    createdAt: notification.createdAt,
  };
}
