import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { appApiFetch, getAppSessionToken, getCurrentMembershipRole } from "../../../lib/app-api-client";
import { fetchEntitlements } from "../billing-actions";
import { logoutAction } from "../actions";
import { fetchNotifications, fetchUnreadNotificationCount } from "../notifications-actions";
import { fetchSeenPageGuides } from "../page-guide-actions";
import { resolveTourSteps } from "../../../lib/tour-steps";
import { ToastProvider } from "../../../components/ui/toast";
import { AppShell } from "./app-shell";
import { AuthenticatedAnalyticsLoader } from "./authenticated-analytics-loader";
import { NotificationBell } from "./notification-bell";
import { PageGuideProvider } from "./page-guide-provider";
import { PageGuideTooltip } from "./page-guide-tooltip";
import { RestartTourButton } from "./restart-tour-button";
import { TourProvider } from "./tour-provider";
import { TourTooltip } from "./tour-tooltip";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const token = await getAppSessionToken();

  // Filet de sécurité côté serveur — chaque page revalide de toute façon son propre accès
  // auprès de l'API (même motif que (protected)/layout.tsx de platform-admin).
  if (!token) {
    redirect("/app/login");
  }

  // Guides de page — lancé tout de suite, en parallèle des autres lectures ; ne lève jamais :
  // `null` (état inconnu) = tous les guides considérés vus, aucun bandeau affiché sur une incertitude.
  const seenPageGuidesPromise = fetchSeenPageGuides();

  // Mission Sprint 17 §37/§99 — jamais bloquant : si la résolution de l'organisation active
  // n'est pas encore possible (première visite, etc.), la cloche s'affiche simplement vide.
  let initialNotifications: Awaited<ReturnType<typeof fetchNotifications>>["items"] = [];
  let initialUnreadCount = 0;
  try {
    // Checkpoint TENDEROS-2.1-P2.3-E11, mission §9 — jamais un volume illimité dans le dropdown de
    // la cloche : la liste complète paginée vit désormais sur /app/notifications.
    const [notificationsPage, unreadCount] = await Promise.all([fetchNotifications({ limit: 5 }), fetchUnreadNotificationCount()]);
    initialNotifications = notificationsPage.items;
    initialUnreadCount = unreadCount;
  } catch {
    // Dégradation silencieuse — voir commentaire ci-dessus.
  }

  // V2 Sprint 25 (Guide interactif) — mission §25.72/§25.84, jamais bloquant : une erreur ici ne
  // doit jamais empêcher l'accès au reste de l'application, seule la visite guidée reste indisponible.
  let hasEverInteractedWithTour = true; // défaut prudent : ne jamais afficher le prompt si l'état est inconnu.
  let hasApiOrWebhooksEntitlement = false;
  try {
    const [currentUser, entitlements] = await Promise.all([
      appApiFetch<{ tourStartedAt?: string; tourCompletedAt?: string; tourDismissedAt?: string }>("/api/v1/auth/me"),
      fetchEntitlements(),
    ]);
    hasEverInteractedWithTour = Boolean(currentUser.tourStartedAt ?? currentUser.tourCompletedAt ?? currentUser.tourDismissedAt);
    hasApiOrWebhooksEntitlement = entitlements.entitlements.includes("PUBLIC_API") || entitlements.entitlements.includes("WEBHOOKS");
  } catch {
    // Dégradation silencieuse — voir commentaire ci-dessus.
  }
  const tourSteps = resolveTourSteps(hasApiOrWebhooksEntitlement);

  // Checkpoint TENDEROS-2.1-P2.3-E6 (mission §16 navigation capability-aware) — résolu ici, jamais
  // dans `AppShell` (Client Component) : un rôle indisponible dégrade vers `undefined`, qui masque
  // par défaut les items filtrés (`getVisibleNavSections`) — jamais un affichage optimiste en cas
  // d'échec de résolution.
  let actorRole: string | undefined;
  try {
    actorRole = await getCurrentMembershipRole();
  } catch {
    // Dégradation silencieuse — voir commentaire ci-dessus.
  }

  const seenPageGuideKeys = await seenPageGuidesPromise;

  return (
    // Design System Checkpoint C — câblage du `ToastProvider` (Checkpoint B, primitive déjà prête
    // mais volontairement non montée alors) au SEUL point d'entrée réel de la surface `/app` :
    // n'affecte aucun écran existant tant qu'aucun n'appelle `useToast()` (aucune page métier
    // modifiée dans ce Checkpoint, mission §38/§39).
    <ToastProvider>
      <TourProvider steps={tourSteps} hasEverInteractedWithTour={hasEverInteractedWithTour}>
        {/* Guides de page — sous `TourProvider` : la visite de bienvenue garde la priorité. */}
        <PageGuideProvider seenGuideKeys={seenPageGuideKeys}>
          <AuthenticatedAnalyticsLoader />
          <AppShell
            actorRole={actorRole}
            headerActions={
              <>
                <RestartTourButton hasEverInteractedWithTour={hasEverInteractedWithTour} />
                <NotificationBell initialNotifications={initialNotifications} initialUnreadCount={initialUnreadCount} />
                <form action={logoutAction}>
                  <button type="submit" className="text-sm text-tenderos-slate hover:text-tenderos-navy hover:underline">
                    Se déconnecter
                  </button>
                </form>
              </>
            }
          >
            {children}
          </AppShell>
          <TourTooltip />
          <PageGuideTooltip />
        </PageGuideProvider>
      </TourProvider>
    </ToastProvider>
  );
}
