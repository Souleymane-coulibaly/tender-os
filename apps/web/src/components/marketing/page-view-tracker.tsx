"use client";

import { useEffect, useRef } from "react";
import { trackEvent, type GaEventName } from "../../lib/analytics";
import { useConsent } from "./consent-provider";

/**
 * V2 Sprint 25 (mission §25.92) — un événement personnalisé au montage, jamais de PII. Le
 * `pageview` GA4 standard reste géré automatiquement par `initGtagConfig` (`AnalyticsLoader`) —
 * celui-ci est un événement PRODUIT distinct, explicitement nommé par la mission.
 *
 * Correctif audit Codex Checkpoint 25E (P2, 2 tours) — un simple `useEffect(() => trackEvent(event), [])`
 * perdait silencieusement l'événement si l'utilisateur arrivait AVANT tout consentement puis
 * acceptait "Tout accepter" sans quitter la page. Ce composant réagit donc au consentement
 * Analytics lui-même (`useConsent`) et émet l'événement dès qu'il devient accordé, une seule fois
 * par montage de page (jamais un second envoi si le consentement change plusieurs fois, jamais
 * perdu s'il change une seule fois après le premier rendu). Le réaudit a relevé un second défaut,
 * plus profond, sur le même symptôme : `window.gtag` n'était en réalité JAMAIS défini par le code
 * applicatif (voir le correctif dans `analytics.ts`), donc `trackEvent` pouvait no-op y compris ici
 * quel que soit le moment de l'appel — corrigé à la source, jamais par un contournement local.
 */
export function PageViewTracker({ event }: { event: GaEventName }) {
  const { consent } = useConsent();
  const analyticsGranted = consent?.analytics === true;
  const hasFired = useRef(false);

  useEffect(() => {
    if (!analyticsGranted || hasFired.current) return;
    trackEvent(event);
    hasFired.current = true;
  }, [analyticsGranted, event]);

  return null;
}
