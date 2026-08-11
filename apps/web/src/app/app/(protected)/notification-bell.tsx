"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markAllNotificationsReadAction, markNotificationReadAction } from "../notifications-actions";
import type { NotificationSummary } from "../../../lib/market-watch-types";

/** Mission §37/§99/§100 — cloche de notification minimale (badge non-lues + liste + clic ->
 *  marché correspondant), pas de centre de notifications séparé plus complexe. */
export function NotificationBell({ initialNotifications, initialUnreadCount }: { initialNotifications: NotificationSummary[]; initialUnreadCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [, startTransition] = useTransition();

  function handleClickNotification(notification: NotificationSummary) {
    if (!notification.readAt) {
      setUnreadCount((count) => Math.max(0, count - 1));
      setNotifications((current) => current.map((n) => (n.id === notification.id ? { ...n, readAt: new Date().toISOString() } : n)));
      startTransition(async () => {
        await markNotificationReadAction(notification.id);
      });
    }
    setOpen(false);
    if (notification.targetUrl) {
      router.push(notification.targetUrl);
    }
  }

  function handleMarkAllRead() {
    setUnreadCount(0);
    setNotifications((current) => current.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    startTransition(async () => {
      await markAllNotificationsReadAction();
    });
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="relative rounded p-2 text-sm text-neutral-600 hover:bg-neutral-100" aria-label="Notifications">
        🔔
        {unreadCount > 0 ? <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded border border-neutral-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 ? (
              <button type="button" onClick={handleMarkAllRead} className="text-xs text-neutral-500 hover:underline">
                Tout marquer lu
              </button>
            ) : null}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-sm text-neutral-500">Aucune notification.</p>
            ) : (
              <ul>
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => handleClickNotification(notification)}
                      className={`block w-full border-b border-neutral-50 px-3 py-2 text-left text-sm hover:bg-neutral-50 ${notification.readAt ? "text-neutral-500" : "font-medium text-neutral-900"}`}
                    >
                      {notification.title}
                      {notification.body ? <p className="mt-0.5 text-xs font-normal text-neutral-500">{notification.body}</p> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link href="/app/market-watch" onClick={() => setOpen(false)} className="block border-t border-neutral-100 px-3 py-2 text-center text-xs text-neutral-600 hover:bg-neutral-50">
            Voir la veille
          </Link>
        </div>
      ) : null}
    </div>
  );
}
