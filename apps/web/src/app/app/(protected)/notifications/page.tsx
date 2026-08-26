import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, TabsNav } from "../../../../components/ui";
import { fetchNotificationPreferences, fetchNotifications } from "../../notifications-actions";
import { ApiErrorState } from "../api-error-state";
import { MarkAllReadButton } from "./mark-all-read-button";
import { NotificationListItem } from "./notification-list-item";
import { NotificationPreferencesCard } from "./notification-preferences-card";

export const metadata: Metadata = { title: "Notifications — TenderOS" };

const PAGE_SIZE = 20;

/** Checkpoint TENDEROS-2.1-P2.3-E11 — mission §5/§6 "Centre de notifications", surface complète
 *  au-dessus de la SOT existante (E10) : liste paginée (curseur, jamais l'historique complet),
 *  filtre Toutes/Non lues, lu/non-lu, tout marquer comme lu, et préférences email par catégorie.
 *  Jamais de recalcul de notifications ici — uniquement les mêmes endpoints déjà utilisés par la
 *  cloche. */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string; cursor?: string }> }) {
  const { filter, cursor } = await searchParams;
  const unreadOnly = filter === "unread";

  let notificationsPage: Awaited<ReturnType<typeof fetchNotifications>>;
  let preferences: Awaited<ReturnType<typeof fetchNotificationPreferences>>;
  try {
    [notificationsPage, preferences] = await Promise.all([fetchNotifications({ unreadOnly, cursor, limit: PAGE_SIZE }), fetchNotificationPreferences()]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const hasUnread = notificationsPage.items.some((n) => !n.readAt) || unreadOnly;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Retrouvez ici les correspondances de veille, les mentions, validations et informations de facturation."
        actions={hasUnread ? <MarkAllReadButton /> : undefined}
      />

      <NotificationPreferencesCard initialPreferences={preferences} />

      <div className="flex flex-col gap-4">
        <TabsNav
          items={[
            { label: "Toutes", href: "/app/notifications" },
            { label: "Non lues", href: "/app/notifications?filter=unread" },
          ]}
          activeHref={unreadOnly ? "/app/notifications?filter=unread" : "/app/notifications"}
        />

        {notificationsPage.items.length === 0 ? (
          <EmptyState
            title={unreadOnly ? "Vous n'avez aucune notification non lue." : "Aucune notification pour le moment."}
            description={unreadOnly ? undefined : "Les nouvelles correspondances de veille, mentions et validations apparaîtront ici."}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {notificationsPage.items.map((notification) => (
              <NotificationListItem key={notification.id} notification={notification} />
            ))}
          </ul>
        )}

        {notificationsPage.nextCursor ? (
          <Link
            href={`/app/notifications?${unreadOnly ? "filter=unread&" : ""}cursor=${notificationsPage.nextCursor}`}
            className="self-center text-sm font-medium text-tenderos-blue hover:underline"
          >
            Voir plus
          </Link>
        ) : null}
      </div>
    </div>
  );
}
