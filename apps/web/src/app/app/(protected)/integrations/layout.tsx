import type { ReactNode } from "react";
import Link from "next/link";

const SUB_NAV_ITEMS = [
  { href: "/app/integrations/api-keys", label: "Clés API" },
  { href: "/app/integrations/webhooks", label: "Webhooks" },
  { href: "/app/integrations/connectors", label: "Connecteurs" },
];

/** Sous-navigation locale à la section Intégrations (V2 Sprint 16) — même motif que
 *  ai-configuration/layout.tsx : un seul NAV_ITEMS de haut niveau pointe ici. */
export default function IntegrationsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Intégrations</h1>
        <p className="text-sm text-neutral-600">API publique, clés API et webhooks pour connecter TenderOS à vos automatisations (n8n, etc.). Réservé Propriétaire/Administrateur.</p>
      </div>
      <nav className="flex gap-1 border-b border-neutral-200">
        {SUB_NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className="rounded-t px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900">
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
