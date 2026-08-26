"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { NotificationSummary } from "../../lib/market-watch-types";
import type { NotificationCategoryId, NotificationPreferenceSummary } from "../../lib/notification-types";

export async function fetchNotifications(input?: { unreadOnly?: boolean | undefined; cursor?: string | undefined; limit?: number | undefined }): Promise<{ items: NotificationSummary[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (input?.unreadOnly) params.set("unreadOnly", "true");
  if (input?.cursor) params.set("cursor", input.cursor);
  if (input?.limit) params.set("limit", String(input.limit));
  const query = params.toString();
  return appApiFetch(`/api/v1/notifications${query ? `?${query}` : ""}`);
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

/** Checkpoint TENDEROS-2.1-P2.3-E11 — préférences PERSONNELLES (mission §20/§21), jamais un
 *  paramètre `userId` : toujours l'acteur authentifié courant, résolu côté backend. */
export async function fetchNotificationPreferences(): Promise<NotificationPreferenceSummary[]> {
  const result = await appApiFetch<{ items: NotificationPreferenceSummary[] }>("/api/v1/notifications/preferences");
  return result.items;
}

export async function updateNotificationPreferenceAction(category: NotificationCategoryId, emailEnabled: boolean): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/notifications/preferences/${category}`, { method: "PUT", body: JSON.stringify({ emailEnabled }) });
  } catch (error) {
    console.error("[TenderOS] Failed to update notification preference:", error instanceof AppApiError ? `${error.status} ${error.code}` : error);
    return { error: "Une erreur est survenue." };
  }
  revalidatePath("/app/notifications");
  return {};
}
