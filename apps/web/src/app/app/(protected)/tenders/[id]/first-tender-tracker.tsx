"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { GA_EVENTS, trackEvent } from "../../../../../lib/analytics";

const TRACKED_STORAGE_KEY = "tenderos_first_tender_tracked";

/**
 * V2 Sprint 25 (mission §25.92 "first_tender_started") — `createTenderAction` (server action)
 * redirige avec `?created=1` uniquement à la création réussie. `trackEvent` exige `window`, donc
 * inatteignable depuis l'action serveur elle-même — ce petit composant client lit le signal, ne
 * déclenche qu'UNE SEULE fois par utilisateur (mission "first_", jamais à chaque création
 * ultérieure — flag localStorage, aucune donnée serveur nécessaire pour ce simple garde-fou UI),
 * puis nettoie l'URL pour ne jamais re-déclencher sur un rechargement de page.
 */
export function FirstTenderTracker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const created = searchParams.get("created") === "1";

  useEffect(() => {
    if (!created) return;
    const alreadyTracked = window.localStorage.getItem(TRACKED_STORAGE_KEY) === "1";
    if (!alreadyTracked) {
      trackEvent(GA_EVENTS.FirstTenderStarted);
      try {
        window.localStorage.setItem(TRACKED_STORAGE_KEY, "1");
      } catch {
        // Stockage indisponible — jamais bloquant, l'événement a déjà été envoyé cette fois-ci.
      }
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("created");
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }, [created, router]);

  return null;
}
