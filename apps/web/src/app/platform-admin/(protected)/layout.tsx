import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Button } from "../../../components/ui";
import { getPlatformSessionToken } from "../../../lib/platform-api-client";
import { logoutAction } from "../actions";
import { PlatformAdminNav } from "./platform-admin-nav";

/**
 * Coquille du back-office plateforme — mêmes jetons que l'App Shell de l'espace organisation
 * (`app/(protected)/app-shell.tsx`) : navigation sur fond navy, en-tête blanc bordé, contenu sur
 * fond `tenderos-light`. La navigation passe en ligne au-dessus du contenu avant `md:`.
 */
export default async function PlatformAdminLayout({ children }: { children: ReactNode }) {
  const token = await getPlatformSessionToken();

  // Filet de sécurité côté serveur en complément du Middleware (qui ne fait qu'une
  // redirection UX) — chaque page revalidera de toute façon son propre accès auprès
  // de l'API (skills/platform-foundation/FRONTEND_PATTERNS.md §25).
  if (!token) {
    redirect("/platform-admin/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-tenderos-light">
      <header className="flex items-center justify-between gap-3 border-b border-tenderos-navy/10 bg-white px-4 py-3 md:px-6 md:py-4">
        <span className="text-sm font-semibold uppercase tracking-wide text-tenderos-slate">
          TenderOS Platform Admin
        </span>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Se déconnecter
          </Button>
        </form>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <PlatformAdminNav />
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
