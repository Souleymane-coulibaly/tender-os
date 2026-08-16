"use client";

import { useEffect } from "react";
import { GA_EVENTS, trackEvent } from "../../../lib/analytics";

const LAST_KNOWN_STATUS_STORAGE_KEY = "tenderos_last_known_subscription_status";

/**
 * V2 Sprint 25 (mission §25.92 "starter_trial_conversion") — aucun signal serveur/webhook n'est
 * directement observable côté client au moment de la conversion (Stripe facture automatiquement à
 * J14, l'utilisateur n'est pas forcément en train de naviguer à cet instant). Détection au premier
 * chargement du Dashboard suivant la conversion : compare le statut REÇU du serveur (jamais recalculé
 * ici) à la dernière valeur connue en localStorage — une transition TRIALING → ACTIVE déclenche
 * l'événement une seule fois, jamais à chaque visite tant que le statut reste ACTIVE.
 */
export function TrialConversionTracker({ subscriptionStatus }: { subscriptionStatus: string | null }) {
  useEffect(() => {
    if (!subscriptionStatus) return;
    let previousStatus: string | null = null;
    try {
      previousStatus = window.localStorage.getItem(LAST_KNOWN_STATUS_STORAGE_KEY);
      window.localStorage.setItem(LAST_KNOWN_STATUS_STORAGE_KEY, subscriptionStatus);
    } catch {
      return; // Stockage indisponible — jamais de comparaison fiable possible, jamais d'événement fabriqué.
    }

    if (previousStatus === "TRIALING" && subscriptionStatus === "ACTIVE") {
      trackEvent(GA_EVENTS.StarterTrialConversion);
    }
  }, [subscriptionStatus]);

  return null;
}
