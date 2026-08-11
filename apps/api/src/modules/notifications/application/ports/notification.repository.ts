import type { Notification } from "../../domain/notification.entity";

export type NotificationPage = Readonly<{ items: Notification[]; nextCursor: string | null }>;

export interface NotificationRepository {
  create(notification: Notification): Promise<void>;
  save(notification: Notification): Promise<void>;
  findById(input: { organizationId: string; notificationId: string }): Promise<Notification | null>;
  listByUser(input: { organizationId: string; userId: string; unreadOnly?: boolean | undefined; cursor?: string | undefined; limit: number }): Promise<NotificationPage>;
  countUnreadByUser(input: { organizationId: string; userId: string }): Promise<number>;
  markAllReadByUser(input: { organizationId: string; userId: string; occurredAt: Date }): Promise<void>;
}

export const NOTIFICATION_REPOSITORY = Symbol("NOTIFICATION_REPOSITORY");
