"use client";

import { usePathname } from "next/navigation";
import { TabsNav, type TabItem } from "./tabs-nav";

/**
 * Onglets d'une section de paramètres (Configuration IA, Intégrations) rendus par son layout. Un
 * layout ne sait pas quelle page il enveloppe : l'onglet actif est déduit de l'adresse — celui dont
 * l'adresse est le plus long préfixe de la page courante, pour qu'une fiche (`/models/123`) ou une
 * création (`/models/new`) garde son onglet (« Modèles ») actif. Rendu identique à `TabsNav`.
 */
export function SectionTabs({ items, ariaLabel }: { items: readonly TabItem[]; ariaLabel: string }) {
  const pathname = usePathname() ?? "";
  const active = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return <TabsNav items={items} activeHref={active?.href ?? ""} ariaLabel={ariaLabel} />;
}
