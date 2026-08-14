"use client";

import Script from "next/script";
import { useEffect } from "react";
import { applyConsentToGtag, GA_MEASUREMENT_ID, initGtagConfig, setDefaultDeniedConsent } from "../../lib/analytics";
import { useConsent } from "./consent-provider";

/**
 * V2 Sprint 23 (landing) — mission §33/§34/§48. Sans rendu visuel. Le script GA4 n'est monté QUE
 * lorsque le consentement Analytics est accordé (interprétation stricte "pas de dépôt de cookie
 * avant consentement") — jamais chargé puis simplement "refusé" (mission §58/§59). Sans
 * `NEXT_PUBLIC_GA_MEASUREMENT_ID`, aucun script n'est jamais monté (mission §63 "pas de crash").
 */
export function AnalyticsLoader() {
  const { consent } = useConsent();
  const analyticsGranted = consent?.analytics === true;

  useEffect(() => {
    if (analyticsGranted) {
      applyConsentToGtag(true);
    }
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
