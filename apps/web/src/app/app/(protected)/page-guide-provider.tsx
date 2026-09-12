"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PageGuideContext, type ActivePageGuide, type PageGuideContextValue } from "../../../components/page-guide/page-guide-context";
import { GA_EVENTS, trackEvent } from "../../../lib/analytics";
import { filterPresentSteps, type PageGuideAction, type PageGuideRegistry } from "../../../lib/page-guide-runtime";
import { PAGE_GUIDES, type PageGuideKey } from "../../../lib/page-guides";
import { recordPageGuideAction } from "../page-guide-actions";
import { useTour } from "./tour-provider";

/**
 * Guides de page — état et navigation, monté une seule fois dans `(protected)/layout.tsx`, À
 * L'INTÉRIEUR de `TourProvider` : la visite de bienvenue reste prioritaire.
 *
 * - Visite de bienvenue en cours → aucun guide de page ne peut démarrer, et un guide ouvert est
 *   refermé (sans rien enregistrer : l'utilisateur n'a ni terminé ni ignoré ce guide).
 * - Bandeau « Bienvenue » affiché → aucun bandeau de guide de page (voir `PageGuideBanner`) ; le
 *   bouton « Guide de cette page » reste utilisable.
 * - Changement de page → le guide ouvert est refermé sans rien enregistrer (il ne navigue jamais,
 *   ses cibles n'existent que sur sa page).
 *
 * L'état « déjà vu » vient du serveur (`seenGuideKeys`, résolu par le layout) ; `null` = inconnu →
 * tous les guides sont considérés vus (aucun bandeau), le bouton reste utilisable.
 */
export function PageGuideProvider({
  seenGuideKeys,
  guides = PAGE_GUIDES,
  children,
}: {
  /** Clés terminées ou ignorées ; `null` si l'état serveur n'a pas pu être lu. */
  seenGuideKeys: readonly PageGuideKey[] | null;
  /** Registre injectable (tests) ; `PAGE_GUIDES` par défaut. */
  guides?: PageGuideRegistry;
  children: ReactNode;
}) {
  const { isTourActive, isPromptVisible } = useTour();
  const pathname = usePathname();
  // Enregistrements faits pendant la session (mise à jour optimiste), fusionnés avec l'état serveur.
  const [recordedKeys, setRecordedKeys] = useState<ReadonlySet<PageGuideKey>>(() => new Set());
  const [activeGuide, setActiveGuide] = useState<ActivePageGuide | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const isStateKnown = seenGuideKeys !== null;
  const serverSeenKeys = useMemo(() => new Set(seenGuideKeys ?? []), [seenGuideKeys]);

  const isSeen = useCallback((key: PageGuideKey) => !isStateKnown || serverSeenKeys.has(key) || recordedKeys.has(key), [isStateKnown, serverSeenKeys, recordedKeys]);

  const record = useCallback(async (key: PageGuideKey, action: PageGuideAction) => {
    setRecordedKeys((previous) => (previous.has(key) ? previous : new Set(previous).add(key)));
    try {
      await recordPageGuideAction(key, action);
    } catch {
      // Jamais visible : l'état local reste « vu », seul le prochain chargement pourrait reproposer le bandeau.
    }
  }, []);

  const start = useCallback(
    (key: PageGuideKey) => {
      if (isTourActive) return false;
      const guide = guides[key];
      const steps = filterPresentSteps(guide.steps);
      if (steps.length === 0) return false;
      setActiveGuide({ key, pageLabel: guide.pageLabel, steps });
      setCurrentStepIndex(0);
      trackEvent(GA_EVENTS.PageGuideStarted, { guide_key: key });
      return true;
    },
    [guides, isTourActive],
  );

  const next = useCallback(async () => {
    if (!activeGuide) return;
    if (currentStepIndex < activeGuide.steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
      return;
    }
    setActiveGuide(null);
    trackEvent(GA_EVENTS.PageGuideCompleted, { guide_key: activeGuide.key });
    await record(activeGuide.key, "COMPLETE");
  }, [activeGuide, currentStepIndex, record]);

  const previous = useCallback(() => {
    setCurrentStepIndex((index) => Math.max(0, index - 1));
  }, []);

  const close = useCallback(async () => {
    if (!activeGuide) return;
    setActiveGuide(null);
    await record(activeGuide.key, "DISMISS");
  }, [activeGuide, record]);

  // La visite de bienvenue a priorité : elle referme un guide de page ouvert.
  useEffect(() => {
    if (isTourActive) setActiveGuide(null);
  }, [isTourActive]);

  const previousPathname = useRef(pathname);
  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    setActiveGuide(null);
  }, [pathname]);

  const value = useMemo<PageGuideContextValue>(
    () => ({
      guides,
      isSeen,
      isGlobalTourActive: isTourActive,
      isWelcomePromptVisible: isPromptVisible,
      activeGuide,
      currentStepIndex,
      start,
      next,
      previous,
      close,
      record,
    }),
    [guides, isSeen, isTourActive, isPromptVisible, activeGuide, currentStepIndex, start, next, previous, close, record],
  );

  return <PageGuideContext.Provider value={value}>{children}</PageGuideContext.Provider>;
}
