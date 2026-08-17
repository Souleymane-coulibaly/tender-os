"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { NAV_SECTIONS } from "./nav-sections";

function isActiveHref(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * V2 Sprint 25F (homogénéisation UX/UI) — App Shell premium, mission §25F.5/§25F.6/§25F.84.
 * Sidebar Navy unique (jamais deux blocs `data-tour` distincts desktop/mobile — les cibles de la
 * visite guidée, `tour-steps.ts`, doivent rester interrogeables via `document.querySelector` quel
 * que soit l'état ouvert/fermé du panneau) : toujours montée dans le DOM, positionnée statiquement
 * dès `md:`, transformée hors-écran (`-translate-x-full`) en drawer avant `md:`. `headerActions`
 * (notifications, redémarrer la visite, déconnexion) reste rendu côté serveur par `layout.tsx` et
 * traverse la frontière client/serveur en tant que `ReactNode`, jamais réimplémenté ici.
 */
export function AppShell({ headerActions, children }: { headerActions: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const [isOpen, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {isOpen ? (
        <button
          type="button"
          aria-label="Fermer le menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-tenderos-navy/40 md:hidden"
        />
      ) : null}

      <aside
        id="app-sidebar-nav"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-tenderos-navy shadow-xl transition-transform duration-200 md:static md:z-auto md:w-64 md:max-w-none md:shrink-0 md:shadow-none md:transition-none ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex h-16 items-center justify-between px-5">
          {/* Design System Checkpoint C — vrai logo de marque (mission §25 "utiliser le VRAI logo
              TenderOS déjà présent dans les assets, ne pas recréer un faux logo") : le texte brut
              "TenderOS" rendait une identité différente de celle de la Landing (`site-header.tsx`).
              Variante `-dark` (texte blanc + "OS" or) — même asset que `site-footer.tsx`, conçue
              pour un fond sombre, ici `bg-tenderos-navy`. */}
          <Link href="/app" aria-label="TenderOS">
            <img src="/brand/tenderos-logo-horizontal-dark.svg" alt="TenderOS" className="h-7 w-auto" width={160} height={35} />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-white/10 md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="mb-5">
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">{section.label}</p>
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const active = isActiveHref(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        data-tour={item.tourTarget}
                        onClick={() => setOpen(false)}
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
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-tenderos-navy/10 bg-white px-4 py-3 md:px-6 md:py-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={isOpen}
            aria-controls="app-sidebar-nav"
            aria-label="Ouvrir le menu"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-tenderos-navy hover:bg-tenderos-light md:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <path d="M2 6H20M2 11H20M2 16H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <div className="flex flex-1 items-center justify-end gap-3">{headerActions}</div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
