import type { ReactNode } from "react";
import Link from "next/link";

const SUB_NAV_ITEMS = [
  { href: "/app/ai-configuration/models", label: "Modèles" },
  { href: "/app/ai-configuration/benchmarks", label: "Benchmarks" },
  { href: "/app/ai-configuration/recommendations", label: "Recommandations" },
  { href: "/app/ai-configuration/routing-policies", label: "Routing" },
  { href: "/app/ai-configuration/prompts", label: "Prompts" },
  { href: "/app/ai-configuration/export-templates", label: "Templates d'export" },
];

/** Sous-navigation locale à la section Configuration IA (Sprint 5.2) — un seul NAV_ITEMS de haut
 *  niveau pointe ici (même motif que le reste de l'app : pas de sur-imbrication de la nav
 *  principale). */
export default function AiConfigurationLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <nav className="flex gap-1 border-b border-neutral-200">
        {SUB_NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-t px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
