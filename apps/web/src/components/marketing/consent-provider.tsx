"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { applyConsentToGtag } from "../../lib/analytics";
import {
  ACCEPT_ALL_CONSENT,
  REJECT_ALL_CONSENT,
  readStoredConsent,
  writeStoredConsent,
  type ConsentCategories,
} from "../../lib/consent";

type ConsentContextValue = Readonly<{
  /** `null` tant qu'aucun choix valide n'existe pour la politique COURANTE (mission §41) — le
   *  banner doit alors s'afficher (mission §58 "première visite : banner visible"). */
  consent: ConsentCategories | null;
  isSettingsOpen: boolean;
  acceptAll: () => void;
  rejectAll: () => void;
  savePreferences: (categories: ConsentCategories) => void;
  openSettings: () => void;
  closeSettings: () => void;
}>;

const ConsentContext = createContext<ConsentContextValue | null>(null);

/**
 * V2 Sprint 23 (landing) — mission §37-43. Monté UNE SEULE FOIS dans le layout `(marketing)`
 * (jamais dans le layout racine — `/app`/`/platform-admin` n'ont pas besoin de ce consentement,
 * mission §2 "la Landing doit fonctionner sans Crisp/Analytics", non-régression §72/§73). État
 * PUREMENT local (localStorage) : `AnalyticsLoader`/`CrispLoader` consomment ce contexte pour leurs
 * propres effets de bord, jamais l'inverse.
 */
export function ConsentProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<ConsentCategories | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const stored = readStoredConsent();
    if (stored) {
      setConsent({ necessary: true, analytics: stored.analytics, support: stored.support });
      // Correctif réaudit Codex (Sprint 25E, 4e tour, P2) — appelé ici directement plutôt que
      // laissé à un effet réactif propre à `AnalyticsLoader` : React exécute les effets des ENFANTS
      // avant ceux des composants parents, donc l'effet de `PageViewTracker` (monté dans la page,
      // un enfant du layout `(marketing)`) pouvait s'exécuter AVANT celui d'`AnalyticsLoader` (monté
      // dans le layout, un parent) — `trackEvent` lisait alors encore le drapeau de consentement à
      // `false`, perdait l'événement silencieusement, et `hasFired` empêchait tout nouvel essai.
      // `ConsentProvider` est la SEULE source de vérité du consentement (mission §37) : c'est donc le
      // seul endroit garanti de s'exécuter avant tout effet qui dépend de `consent`, jamais après.
      applyConsentToGtag(stored.analytics);
    }
  }, []);

  const savePreferences = useCallback((categories: ConsentCategories) => {
    writeStoredConsent(categories);
    applyConsentToGtag(categories.analytics);
    setConsent(categories);
    setIsSettingsOpen(false);
  }, []);

  const acceptAll = useCallback(() => savePreferences(ACCEPT_ALL_CONSENT), [savePreferences]);
  const rejectAll = useCallback(() => savePreferences(REJECT_ALL_CONSENT), [savePreferences]);
  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  const value = useMemo<ConsentContextValue>(
    () => ({ consent, isSettingsOpen, acceptAll, rejectAll, savePreferences, openSettings, closeSettings }),
    [consent, isSettingsOpen, acceptAll, rejectAll, savePreferences, openSettings, closeSettings],
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export function useConsent(): ConsentContextValue {
  const context = useContext(ConsentContext);
  if (!context) {
    throw new Error("useConsent must be used within a ConsentProvider");
  }
  return context;
}
