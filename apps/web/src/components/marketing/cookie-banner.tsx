"use client";

import { useConsent } from "./consent-provider";

/**
 * V2 Sprint 23 (landing) — mission §37. "Tout refuser" a EXACTEMENT le même poids visuel que
 * "Tout accepter" (mission §37 "aucun dark pattern") — même variante de bouton, jamais un lien
 * discret pour l'un et un bouton plein pour l'autre.
 */
export function CookieBanner() {
  const { consent, acceptAll, rejectAll, openSettings } = useConsent();

  if (consent !== null) return null;

  return (
    <div
      role="region"
      aria-label="Consentement aux cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-tenderos-navy/10 bg-white/98 px-4 py-5 shadow-[0_-8px_24px_rgba(10,42,91,0.12)] backdrop-blur sm:px-6"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <p className="font-tenderos-display text-sm font-bold text-tenderos-navy">Votre confidentialité compte</p>
          <p className="mt-1 text-sm text-tenderos-slate">
            TenderOS utilise des technologies nécessaires au fonctionnement du site et, avec votre accord, des outils de mesure d&apos;audience et de support afin d&apos;améliorer votre expérience. Vous pouvez accepter, refuser ou personnaliser vos choix à tout moment.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openSettings}
            className="rounded-lg border border-tenderos-navy/20 px-4 py-2 text-sm font-semibold text-tenderos-navy transition hover:bg-tenderos-light"
          >
            Personnaliser
          </button>
          <button
            type="button"
            onClick={rejectAll}
            className="rounded-lg border border-tenderos-navy/20 px-4 py-2 text-sm font-semibold text-tenderos-navy transition hover:bg-tenderos-light"
          >
            Tout refuser
          </button>
          <button
            type="button"
            onClick={acceptAll}
            className="rounded-lg bg-tenderos-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-tenderos-navy/90"
          >
            Tout accepter
          </button>
        </div>
      </div>
    </div>
  );
}
