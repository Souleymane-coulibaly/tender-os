import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformSessionToken } from "../../../lib/platform-api-client";
import { logoutAction } from "../actions";

const NAV_ITEMS = [
  { href: "/platform-admin", label: "Tableau de bord" },
  { href: "/platform-admin/organizations", label: "Organisations" },
  { href: "/platform-admin/users", label: "Utilisateurs" },
  { href: "/platform-admin/audit-logs", label: "Audit" },
];

export default async function PlatformAdminLayout({ children }: { children: ReactNode }) {
  const token = await getPlatformSessionToken();

  // Filet de sécurité côté serveur en complément du Middleware (qui ne fait qu'une
  // redirection UX) — chaque page revalidera de toute façon son propre accès auprès
  // de l'API (skills/platform-foundation/FRONTEND_PATTERNS.md §25).
  if (!token) {
    redirect("/platform-admin/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
        <span className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          TenderOS Platform Admin
        </span>
        <form action={logoutAction}>
          <button type="submit" className="text-sm text-neutral-600 hover:underline">
            Se déconnecter
          </button>
        </form>
      </header>
      <div className="flex flex-1">
        <nav className="w-56 shrink-0 border-r border-neutral-200 p-4">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block rounded px-3 py-2 text-sm hover:bg-neutral-100">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
