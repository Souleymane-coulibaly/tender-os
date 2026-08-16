"use client";

import Link from "next/link";
import { useState } from "react";
import { GA_EVENTS, trackEvent } from "../../lib/analytics";

const NAV_LINKS = [
  { href: "#fonctionnalites", label: "Fonctionnalités" },
  { href: "/pricing", label: "Tarifs" },
  { href: "/a-propos", label: "À propos" },
] as const;

/**
 * V2 Sprint 23 (landing) — mission §8. "Ressources" volontairement absent du nav (mission rule #9
 * "ne pas inventer de références" — aucune page Ressources/Centre d'aide/Guides n'existe encore,
 * voir le footer où elles apparaissent explicitement en "(bientôt)", jamais un lien mort).
 */
export function SiteHeader() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-tenderos-navy/10 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center" aria-label="TenderOS — Accueil">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG vectoriel, aucune optimisation raster requise */}
          <img src="/brand/tenderos-logo-horizontal.svg" alt="TenderOS" className="h-8 w-auto" width={220} height={48} />
        </Link>

        <nav aria-label="Navigation principale" className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-sm font-medium text-tenderos-navy/80 transition hover:text-tenderos-navy">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link href="/app/login" onClick={() => trackEvent(GA_EVENTS.LoginClicked)} className="text-sm font-semibold text-tenderos-navy transition hover:text-tenderos-blue">
            Se connecter
          </Link>
          <Link
            href="/contact"
            onClick={() => trackEvent(GA_EVENTS.DemoCtaClicked, { location: "header" })}
            className="rounded-lg bg-tenderos-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-tenderos-navy/90"
          >
            Demander une démo
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setIsMobileMenuOpen((open) => !open)}
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-nav"
          aria-label={isMobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-tenderos-navy md:hidden"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            {isMobileMenuOpen ? (
              <path d="M4 4L18 18M18 4L4 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M2 6H20M2 11H20M2 16H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {isMobileMenuOpen ? (
        <nav id="mobile-nav" aria-label="Navigation mobile" className="border-t border-tenderos-navy/10 bg-white px-4 py-4 md:hidden">
          <ul className="flex flex-col gap-4">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} onClick={() => setIsMobileMenuOpen(false)} className="text-sm font-medium text-tenderos-navy">
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <Link href="/app/login" onClick={() => trackEvent(GA_EVENTS.LoginClicked)} className="text-sm font-semibold text-tenderos-navy">
                Se connecter
              </Link>
            </li>
            <li>
              <Link
                href="/contact"
                onClick={() => trackEvent(GA_EVENTS.DemoCtaClicked, { location: "header-mobile" })}
                className="inline-block rounded-lg bg-tenderos-navy px-4 py-2 text-sm font-semibold text-white"
              >
                Demander une démo
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
