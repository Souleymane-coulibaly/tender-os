"use client";

import { useTour } from "./tour-provider";

/** V2 Sprint 25 (Guide interactif) — mission §25.83 "Relancer la visite guidée". Aucune surface
 *  Aide/Profil n'existe encore dans le produit (recherche exhaustive) — logé dans l'en-tête partagé
 *  à côté des notifications/déconnexion plutôt que d'inventer une page Profil complète hors
 *  périmètre de ce Sprint.
 *
 *  Design System — lien d'en-tête textuel : mêmes jetons que « Se déconnecter » juste à côté
 *  (`layout.tsx`) plutôt que `Button variant="link"` (bleu), pour garder l'en-tête homogène. */
export function RestartTourButton({ hasEverInteractedWithTour }: { hasEverInteractedWithTour: boolean }) {
  const { restartTour } = useTour();

  if (!hasEverInteractedWithTour) return null;

  return (
    <button type="button" onClick={restartTour} className="text-sm text-tenderos-slate hover:text-tenderos-navy hover:underline">
      Relancer la visite guidée
    </button>
  );
}
