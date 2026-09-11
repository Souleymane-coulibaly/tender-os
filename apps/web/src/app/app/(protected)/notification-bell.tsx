"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "../../../components/ui";
import { fetchNotifications, fetchUnreadNotificationCount, markAllNotificationsReadAction, markNotificationReadAction } from "../notifications-actions";
import type { NotificationSummary } from "../../../lib/market-watch-types";

/** Checkpoint TENDEROS-2.1-P2.3-E10/E11 — cloche + Centre de notifications complet
 *  (`/app/notifications`, mission §5/§9). "Voir toutes les notifications" y renvoie.
 *
 * Mission §45/§46 — aucune infrastructure realtime (WebSocket/SSE) n'existe dans ce dépôt : polling
 * léger du unread-count (60s), première instance de ce motif dans le frontend — jamais introduit
 * SEULEMENT pour ce Checkpoint sans besoin réel (mission §45 "ne pas introduire WebSocket/SSE sauf
 * infrastructure déjà existante"). Mission §47 — suspendu quand l'onglet est masqué
 * (`document.visibilityState`), sans framework de polling dédié disproportionné pour ce besoin. */
const POLL_INTERVAL_MS = 60_000;

export function NotificationBell({ initialNotifications, initialUnreadCount }: { initialNotifications: NotificationSummary[]; initialUnreadCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [, startTransition] = useTransition();
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        try {
          const count = await fetchUnreadNotificationCount();
          setUnreadCount(count);
          // Rafraîchit aussi la liste récente si le dropdown est ouvert (mission §48 "après action,
          // mettre à jour dropdown/badge sans hard refresh" — s'applique symétriquement à l'arrivée
          // d'une notification pendant que le dropdown est déjà ouvert).
          if (openRef.current) {
            const page = await fetchNotifications({ limit: 5 });
            setNotifications(page.items);
          }
        } catch {
          // Best-effort — un poll manqué ne doit jamais afficher d'erreur intrusive.
        }
      })();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

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
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} className="relative" aria-label="Notifications">
        🔔
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-fg px-1 text-xs font-semibold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </Button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-tenderos-navy/10 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-tenderos-navy/10 px-3 py-2">
            <span className="text-sm font-semibold text-tenderos-navy">Notifications</span>
            {unreadCount > 0 ? (
              <Button type="button" variant="link" onClick={handleMarkAllRead} className="text-xs">
                Tout marquer lu
              </Button>
            ) : null}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-sm text-tenderos-slate">Aucune notification.</p>
            ) : (
              <ul>
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    {/* Ligne de liste pleine largeur, contenu à gauche : pas un `Button` (style
                        d'action centré), seulement les jetons de survol et de texte. */}
                    <button
                      type="button"
                      onClick={() => handleClickNotification(notification)}
                      className={`block w-full border-b border-tenderos-navy/5 px-3 py-2 text-left text-sm hover:bg-tenderos-light ${notification.readAt ? "text-tenderos-slate" : "font-medium text-tenderos-navy"}`}
                    >
                      {notification.title}
                      {notification.body ? <p className="mt-0.5 text-xs font-normal text-tenderos-slate">{notification.body}</p> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link href="/app/notifications" onClick={() => setOpen(false)} className="block border-t border-tenderos-navy/10 px-3 py-2 text-center text-xs font-medium text-tenderos-slate hover:bg-tenderos-light">
            Voir toutes les notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
