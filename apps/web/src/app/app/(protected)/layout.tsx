import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppSessionToken } from "../../../lib/app-api-client";
import { logoutAction } from "../actions";
import { fetchNotifications, fetchUnreadNotificationCount } from "../notifications-actions";
import { NotificationBell } from "./notification-bell";

const NAV_ITEMS = [
  { href: "/app", label: "Tableau de bord" },
  { href: "/app/clients", label: "Clients" },
  { href: "/app/subcontractor-profiles", label: "Sous-traitants" },
  { href: "/app/opportunities", label: "Opportunités" },
  { href: "/app/tenders", label: "Appels d'offres" },
  { href: "/app/documents", label: "Documents" },
  { href: "/app/knowledge", label: "Base de connaissances" },
  { href: "/app/pricing", label: "Pricing organisation" },
  { href: "/app/ai-configuration/models", label: "Configuration IA" },
  { href: "/app/integrations/api-keys", label: "Intégrations" },
  { href: "/app/market-watch", label: "Veille" },
  { href: "/app/validations", label: "Mes validations" },
  { href: "/app/subscription", label: "Abonnement & utilisation" },
];

export default async function AppLayout({ children }: { children: ReactNode }) {
  const token = await getAppSessionToken();

  // Filet de sécurité côté serveur — chaque page revalide de toute façon son propre accès
  // auprès de l'API (même motif que (protected)/layout.tsx de platform-admin).
  if (!token) {
    redirect("/app/login");
  }

  // Mission Sprint 17 §37/§99 — jamais bloquant : si la résolution de l'organisation active
  // n'est pas encore possible (première visite, etc.), la cloche s'affiche simplement vide.
  let initialNotifications: Awaited<ReturnType<typeof fetchNotifications>>["items"] = [];
  let initialUnreadCount = 0;
  try {
    const [notificationsPage, unreadCount] = await Promise.all([fetchNotifications(), fetchUnreadNotificationCount()]);
    initialNotifications = notificationsPage.items;
    initialUnreadCount = unreadCount;
  } catch {
    // Dégradation silencieuse — voir commentaire ci-dessus.
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
        <span className="text-sm font-semibold uppercase tracking-wide text-neutral-500">TenderOS</span>
        <div className="flex items-center gap-3">
          <NotificationBell initialNotifications={initialNotifications} initialUnreadCount={initialUnreadCount} />
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-neutral-600 hover:underline">
              Se déconnecter
            </button>
          </form>
        </div>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        {/* Mission Sprint 15 §7/§9/§107 — barre horizontale scrollable en mobile/tablette (jamais
            une largeur fixe qui provoque un débordement horizontal global), sidebar classique à
            partir de md:. Bénéficie à toutes les pages, pas seulement au Dashboard. */}
        <nav className="shrink-0 overflow-x-auto border-b border-neutral-200 p-2 md:w-56 md:overflow-visible md:border-b-0 md:border-r md:p-4">
          <ul className="flex gap-1 md:flex-col">
            {NAV_ITEMS.map((item) => (
              <li key={item.href} className="shrink-0 md:shrink">
                <Link href={item.href} className="block whitespace-nowrap rounded px-3 py-2 text-sm hover:bg-neutral-100">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
