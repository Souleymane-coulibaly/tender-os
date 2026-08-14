"use client";

import { useEffect, useState } from "react";
import { ACCEPT_ALL_CONSENT, REJECT_ALL_CONSENT, type ConsentCategories } from "../../lib/consent";
import { useConsent } from "./consent-provider";

/**
 * V2 Sprint 23 (landing) — mission §39/§42. Réouvrable à tout moment (banner "Personnaliser" OU
 * lien pied de page "Gestion des cookies", même instance via `ConsentProvider`) — mission §42
 * "l'utilisateur peut retirer Analytics/Support à tout moment".
 */
export function CookieSettingsModal() {
  const { consent, isSettingsOpen, closeSettings, savePreferences } = useConsent();
  const [analytics, setAnalytics] = useState(consent?.analytics ?? false);
  const [support, setSupport] = useState(consent?.support ?? false);

  useEffect(() => {
    if (isSettingsOpen) {
      setAnalytics(consent?.analytics ?? false);
      setSupport(consent?.support ?? false);
    }
  }, [isSettingsOpen, consent]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeSettings();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isSettingsOpen, closeSettings]);

  if (!isSettingsOpen) return null;

  function save(categories: ConsentCategories) {
    savePreferences(categories);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-tenderos-navy/40 px-4" onClick={closeSettings}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-settings-title"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="cookie-settings-title" className="font-tenderos-display text-lg font-bold text-tenderos-navy">
          Gestion des cookies
        </h2>
        <p className="mt-1 text-sm text-tenderos-slate">Personnalisez les catégories de cookies que vous autorisez.</p>

        <div className="mt-5 space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-tenderos-navy/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-tenderos-navy">Nécessaires</p>
              <p className="text-xs text-tenderos-slate">Toujours actifs — indispensables au fonctionnement du site.</p>
            </div>
            <span className="rounded-full bg-tenderos-light px-3 py-1 text-xs font-semibold text-tenderos-slate">Toujours actifs</span>
          </div>

          <label className="flex items-center justify-between rounded-lg border border-tenderos-navy/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-tenderos-navy">Mesure d&apos;audience</p>
              <p className="text-xs text-tenderos-slate">Google Analytics 4 — statistiques de fréquentation anonymisées.</p>
            </div>
            <input
              type="checkbox"
              checked={analytics}
              onChange={(event) => setAnalytics(event.target.checked)}
              aria-label="Autoriser la mesure d'audience"
              className="h-5 w-5 accent-tenderos-navy"
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-tenderos-navy/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-tenderos-navy">Support</p>
              <p className="text-xs text-tenderos-slate">Crisp — chat de support en direct.</p>
            </div>
            <input
              type="checkbox"
              checked={support}
              onChange={(event) => setSupport(event.target.checked)}
              aria-label="Autoriser le support (Crisp)"
              className="h-5 w-5 accent-tenderos-navy"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={() => save(REJECT_ALL_CONSENT)} className="rounded-lg border border-tenderos-navy/20 px-4 py-2 text-sm font-semibold text-tenderos-navy transition hover:bg-tenderos-light">
            Tout refuser
          </button>
          <button type="button" onClick={() => save(ACCEPT_ALL_CONSENT)} className="rounded-lg border border-tenderos-navy/20 px-4 py-2 text-sm font-semibold text-tenderos-navy transition hover:bg-tenderos-light">
            Tout accepter
          </button>
          <button
            type="button"
            onClick={() => save({ necessary: true, analytics, support })}
            className="rounded-lg bg-tenderos-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-tenderos-navy/90"
          >
            Enregistrer mes choix
          </button>
        </div>
      </div>
    </div>
  );
}
