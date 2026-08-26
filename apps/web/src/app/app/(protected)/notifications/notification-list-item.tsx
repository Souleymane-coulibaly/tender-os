"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "../../../../components/ui";
import { categoryForNotificationType, NOTIFICATION_CATEGORY_LABELS } from "../../../../lib/notification-types";
import type { NotificationSummary } from "../../../../lib/market-watch-types";
import { markNotificationReadAction } from "../../notifications-actions";

/** Checkpoint TENDEROS-2.1-P2.3-E11 — même sémantique que la cloche (mark-read optimiste puis
 *  navigation), mais dans le Centre de notifications, jamais un second mécanisme de lecture. */
function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24 && date.toDateString() === now.toDateString()) return `Aujourd'hui à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Hier à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function NotificationListItem({ notification }: { notification: NotificationSummary }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const isUnread = !notification.readAt;
  const category = categoryForNotificationType(notification.type);

  function handleClick() {
    if (isUnread) {
      startTransition(async () => {
        await markNotificationReadAction(notification.id);
      });
    }
    if (notification.targetUrl) {
      router.push(notification.targetUrl);
    }
  }

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        disabled={!notification.targetUrl && !isUnread}
        className={`flex w-full flex-col gap-1.5 rounded-xl border px-4 py-3 text-left transition ${
          isUnread ? "border-tenderos-blue/20 bg-tenderos-blue/5 hover:bg-tenderos-blue/10" : "border-tenderos-navy/10 bg-white hover:bg-tenderos-light/60"
        } ${!notification.targetUrl && !isUnread ? "cursor-default" : "cursor-pointer"}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {isUnread ? <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-tenderos-blue" /> : null}
            <span className={`text-sm ${isUnread ? "font-semibold text-tenderos-navy" : "font-medium text-tenderos-slate"}`}>{notification.title}</span>
            <span className="sr-only">{isUnread ? "(non lue)" : "(lue)"}</span>
          </div>
          <span className="shrink-0 text-xs text-tenderos-slate">{formatRelativeDate(notification.createdAt)}</span>
        </div>
        {notification.body ? <p className="text-sm text-tenderos-slate">{notification.body}</p> : null}
        {category ? (
          <Badge tone="neutral">{NOTIFICATION_CATEGORY_LABELS[category]}</Badge>
        ) : null}
      </button>
    </li>
  );
}
