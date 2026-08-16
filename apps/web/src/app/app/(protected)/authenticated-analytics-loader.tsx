"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { applyConsentToGtag, GA_MEASUREMENT_ID, initGtagConfig, setDefaultDeniedConsent } from "../../../lib/analytics";
import { readStoredConsent } from "../../../lib/consent";

/**
 * V2 Sprint 25 (mission §25.92 "GA4 / PRODUCT EVENTS") — correctif audit Codex Checkpoint 25E (P1) :
 * `product_tour_started/completed`/`starter_trial_started/conversion`/`first_tender_started`
 * n'étaient jamais émis car AUCUN loader GA4 n'existait sur `/app/*` (Sprint 23 l'avait scopé à la
 * seule Landing). Plutôt que déclarer des événements qui ne partent jamais, ce loader réutilise le
 * consentement DÉJÀ enregistré (`localStorage`, mission §40 "pas de cookie serveur", même clé que
 * `lib/consent.ts`) — jamais un second mécanisme de consentement, et surtout **jamais de nouveau
 * bandeau ici** : un utilisateur qui n'a jamais visité la Landing (ex. invité directement dans une
 * organisation) n'a simplement aucun consentement enregistré, et cette surface reste silencieuse
 * pour lui (défaut conservateur, jamais un consentement supposé).
 */
export function AuthenticatedAnalyticsLoader() {
  const [analyticsGranted, setAnalyticsGranted] = useState(false);

  useEffect(() => {
    const stored = readStoredConsent();
    if (stored?.analytics) setAnalyticsGranted(true);
  }, []);

  useEffect(() => {
    if (analyticsGranted) applyConsentToGtag(true);
  }, [analyticsGranted]);

  if (!GA_MEASUREMENT_ID || !analyticsGranted) return null;

  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      strategy="afterInteractive"
      onReady={() => {
        setDefaultDeniedConsent();
        applyConsentToGtag(true);
        initGtagConfig();
      }}
    />
  );
}
