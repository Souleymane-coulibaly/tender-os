"use client";

import { useEffect } from "react";
import { trackEvent, type GaEventName } from "../../lib/analytics";

/**
 * V2 Sprint 24 (onboarding) — même motif que `TrackedLink` (mission §47 : un point client minimal
 * pour un besoin GA4 précis), pour les événements du funnel qui marquent l'ARRIVÉE sur une étape
 * plutôt qu'un clic (ex. atteindre /onboarding/entreprise prouve que l'étape Compte a réussi).
 * Ne rend rien — pas de payload PII (mission §36), un event name du catalogue fermé uniquement.
 */
export function OnboardingTracker({ event }: { event: GaEventName }) {
  useEffect(() => {
    trackEvent(event);
  }, [event]);

  return null;
}
