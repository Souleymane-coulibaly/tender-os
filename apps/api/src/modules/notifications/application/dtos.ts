import type { Notification } from "../domain/notification.entity";

export type NotificationSummary = Readonly<{
  id: string;
  type: string;
  title: string;
  body?: string | undefined;
  targetUrl?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  readAt?: string | undefined;
  createdAt: string;
}>;

export function toNotificationSummary(notification: Notification): NotificationSummary {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    targetUrl: notification.targetUrl,
    metadata: notification.metadata,
    readAt: notification.readAt?.toISOString(),
    createdAt: notification.createdAt.toISOString(),
  };
}
