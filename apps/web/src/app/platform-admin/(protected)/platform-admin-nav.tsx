"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/platform-admin", label: "Tableau de bord" },
  { href: "/platform-admin/organizations", label: "Organisations" },
  { href: "/platform-admin/users", label: "Utilisateurs" },
  { href: "/platform-admin/audit-logs", label: "Audit" },
];

/** Même règle que l'App Shell de l'espace organisation : l'accueil n'est actif que sur lui-même,
 *  une rubrique l'est aussi sur ses sous-pages (fiche organisation → « Organisations »). */
function isActiveHref(pathname: string, href: string): boolean {
  if (href === "/platform-admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Navigation du back-office — client uniquement pour connaître la page courante. */
export function PlatformAdminNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Back-office" className="shrink-0 bg-tenderos-navy p-3 md:w-56 md:p-4">
      <ul className="flex flex-wrap gap-1 md:flex-col">
        {NAV_ITEMS.map((item) => {
          const active = isActiveHref(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
