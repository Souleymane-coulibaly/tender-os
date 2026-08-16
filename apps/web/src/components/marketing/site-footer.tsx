"use client";

import Link from "next/link";
import { useConsent } from "./consent-provider";

const YEAR = new Date().getFullYear();

/**
 * V2 Sprint 23 (landing) — mission §28. "Centre d'aide"/"Guides" restent volontairement du texte
 * NON cliquable ("bientôt") — mission rule #9 "ne pas inventer de références", aucune de ces pages
 * n'existe (même motif que l'absence de "Ressources" dans le header, voir `site-header.tsx`).
 */
export function SiteFooter() {
  const { openSettings } = useConsent();

  return (
    <footer className="bg-tenderos-navy text-white">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG vectoriel */}
            <img src="/brand/tenderos-logo-horizontal-dark.svg" alt="TenderOS" className="h-8 w-auto" width={220} height={48} />
            <p className="mt-4 max-w-xs text-sm text-white/70">La plateforme tout-en-un pour répondre, collaborer et gagner vos appels d&apos;offres.</p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white/50">Produit</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><a href="#fonctionnalites" className="text-white/80 hover:text-white">Fonctionnalités</a></li>
              <li><a href="/pricing" className="text-white/80 hover:text-white">Tarifs</a></li>
              <li><a href="#integrations" className="text-white/80 hover:text-white">Intégrations</a></li>
              <li><a href="#securite" className="text-white/80 hover:text-white">Sécurité</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white/50">Ressources</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="text-white/40">Centre d&apos;aide (bientôt)</li>
              <li className="text-white/40">Guides (bientôt)</li>
              <li><Link href="/contact" className="text-white/80 hover:text-white">Contact</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white/50">Société</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/a-propos" className="text-white/80 hover:text-white">À propos</Link></li>
              <li><Link href="/contact" className="text-white/80 hover:text-white">Contact</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white/50">Légal</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link href="/legal/mentions" className="text-white/80 hover:text-white">Mentions légales</Link></li>
              <li><Link href="/legal/privacy" className="text-white/80 hover:text-white">Politique de confidentialité</Link></li>
              <li>
                <button type="button" onClick={openSettings} className="text-left text-white/80 hover:text-white">
                  Gestion des cookies
                </button>
              </li>
              <li><Link href="/legal/terms" className="text-white/80 hover:text-white">CGU</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row">
          <p className="text-xs text-white/50">© {YEAR} TenderOS. Tous droits réservés.</p>
          <p className="text-xs font-medium text-white/70">Hébergement en France</p>
        </div>
      </div>
    </footer>
  );
}
