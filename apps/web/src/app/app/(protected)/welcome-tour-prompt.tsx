"use client";

import { useTour } from "./tour-provider";

/**
 * V2 Sprint 25 (Guide interactif) — mission §25.72 "Lors de la première arrivée... Ne jamais
 * forcer." Non-modal (jamais un overlay bloquant le reste de l'écran) — un simple bandeau que
 * l'utilisateur peut ignorer en continuant d'utiliser TenderOS normalement.
 */
export function WelcomeTourPrompt() {
  const { isPromptVisible, startTour, dismissPrompt } = useTour();

  if (!isPromptVisible) return null;

  return (
    <div role="region" aria-label="Bienvenue" className="flex flex-col items-start gap-3 rounded-2xl border border-tenderos-gold/30 bg-tenderos-gold/10 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-tenderos-display text-base font-bold text-tenderos-navy">Bienvenue dans TenderOS</p>
        <p className="mt-1 text-sm text-tenderos-slate">Découvrez les principales fonctionnalités en quelques étapes.</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={startTour} className="rounded-lg bg-tenderos-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-tenderos-navy/90">
          Commencer la visite
        </button>
        <button type="button" onClick={dismissPrompt} className="rounded-lg px-4 py-2 text-sm font-medium text-tenderos-navy hover:bg-white/60">
          Plus tard
        </button>
      </div>
    </div>
  );
}
