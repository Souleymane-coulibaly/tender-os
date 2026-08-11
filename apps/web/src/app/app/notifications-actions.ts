"use server";

import { revalidatePath } from "next/cache";
import { appApiFetch } from "../../lib/app-api-client";
import type { NotificationSummary } from "../../lib/market-watch-types";

export async function fetchNotifications(unreadOnly?: boolean): Promise<{ items: NotificationSummary[]; nextCursor: string | null }> {
  const query = unreadOnly ? "?unreadOnly=true" : "";
  return appApiFetch(`/api/v1/notifications${query}`);
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const result = await appApiFetch<{ count: number }>("/api/v1/notifications/unread-count");
  return result.count;
}

export async function markNotificationReadAction(notificationId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/notifications/${notificationId}/read`, { method: "POST" });
  } catch {
    return { error: "Une erreur est survenue." };
  }
  revalidatePath("/app", "layout");
  return {};
}

export async function markAllNotificationsReadAction(): Promise<{ error?: string }> {
  try {
    await appApiFetch("/api/v1/notifications/read-all", { method: "POST" });
  } catch {
    return { error: "Une erreur est survenue." };
  }
  revalidatePath("/app", "layout");
  return {};
}
