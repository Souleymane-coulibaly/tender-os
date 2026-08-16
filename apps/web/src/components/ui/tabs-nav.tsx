import Link from "next/link";

export type TabItem = { label: string; href: string };

/**
 * V2 Sprint 25F (homogénéisation UX/UI) — navigation par onglets horizontale, mission §25F.7/§25F.15
 * ("l'utilisateur doit toujours comprendre où il est"). Composant serveur : `activeHref` est fourni
 * par la page appelante (chaque route sait déjà quelle page elle est), jamais déduit côté client —
 * évite un flash "aucun onglet actif" avant hydratation.
 */
export function TabsNav({ items, activeHref }: { items: readonly TabItem[]; activeHref: string }) {
  return (
    <nav aria-label="Navigation du dossier" className="flex flex-wrap gap-1 overflow-x-auto border-b border-tenderos-navy/10 pb-px">
      {items.map((item) => {
        const isActive = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition ${
              isActive
                ? "border-tenderos-blue text-tenderos-navy"
                : "border-transparent text-tenderos-slate hover:border-tenderos-navy/20 hover:text-tenderos-navy"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
