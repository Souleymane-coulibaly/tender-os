"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { GA_EVENTS, trackEvent } from "../../../lib/analytics";
import type { TourStep } from "../../../lib/tour-steps";
import { updateTourStateAction } from "../tour-actions";

const ACTIVE_STEP_STORAGE_KEY = "tenderos-tour-active-step";

type TourContextValue = Readonly<{
  steps: readonly TourStep[];
  isPromptVisible: boolean;
  isTourActive: boolean;
  currentStepIndex: number;
  startTour: () => Promise<void>;
  dismissPrompt: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => void;
  closeTour: () => Promise<void>;
}>;

const TourContext = createContext<TourContextValue | null>(null);

/**
 * V2 Sprint 25 (Guide interactif) — mission §25.72 (première arrivée) / §25.82 (user-scoped,
 * jamais organization-scoped) / §25.87 (l'état survit à la navigation). Monté une seule fois dans
 * `(protected)/layout.tsx` (jamais remonté entre les routes `/app/*`, même Provider React tout au
 * long d'une navigation client-side) — `sessionStorage` sert uniquement de filet en cas de
 * rechargement complet de page pendant une visite active (mission §25.87 "traverse plusieurs
 * pages"), jamais l'autorité sur le fait d'avoir déjà terminé/ignoré la visite (qui reste
 * `tourStartedAt`/`tourCompletedAt`/`tourDismissedAt`, résolus une fois côté serveur).
 */
export function TourProvider({
  steps,
  hasEverInteractedWithTour,
  children,
}: {
  steps: readonly TourStep[];
  /** `true` dès que `tourStartedAt`/`tourCompletedAt`/`tourDismissedAt` est renseigné — le prompt
   *  "Bienvenue dans TenderOS" ne s'affiche JAMAIS une seconde fois automatiquement (mission §25.72
   *  "Ne jamais forcer"), seul "Relancer la visite guidée" peut redémarrer la visite ensuite. */
  hasEverInteractedWithTour: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [isPromptVisible, setPromptVisible] = useState(!hasEverInteractedWithTour);
  const [isTourActive, setTourActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Reprise après rechargement complet pendant une visite active (mission §25.87).
  useEffect(() => {
    const stored = window.sessionStorage.getItem(ACTIVE_STEP_STORAGE_KEY);
    if (stored === null) return;
    const index = Number(stored);
    if (Number.isInteger(index) && index >= 0 && index < steps.length) {
      setTourActive(true);
      setCurrentStepIndex(index);
      setPromptVisible(false);
    }
  }, [steps.length]);

  const goToStep = useCallback(
    (index: number) => {
      setCurrentStepIndex(index);
      window.sessionStorage.setItem(ACTIVE_STEP_STORAGE_KEY, String(index));
      const step = steps[index];
      if (step) router.push(step.href);
    },
    [router, steps],
  );

  // Correctif (trouvé en E2E réel) — les écritures ci-dessous sont désormais ATTENDUES avant que
  // l'appelant ne considère l'action terminée : un `void` fire-and-forget laissait une fenêtre de
  // course réelle où un rechargement de page immédiatement après DISMISS/START/COMPLETE lisait
  // encore l'ancien état côté serveur (`tourDismissedAt`/etc. pas encore persisté) — jamais
  // seulement un souci de test, un utilisateur fermant l'onglet juste après "Plus tard" aurait pu
  // revoir le prompt à la prochaine visite malgré son choix explicite.
  // START : l'étape 1 est affichée AVANT d'attendre l'écriture — l'inverse laissait l'utilisateur
  // avancer (« Suivant ») pendant un enregistrement lent, puis le renvoyait à l'étape 1 quand il
  // aboutissait. L'écriture reste attendue avant de rendre la main.
  const startTour = useCallback(async () => {
    setPromptVisible(false);
    setTourActive(true);
    trackEvent(GA_EVENTS.ProductTourStarted);
    goToStep(0);
    await updateTourStateAction("START");
  }, [goToStep]);

  const dismissPrompt = useCallback(async () => {
    await updateTourStateAction("DISMISS");
    setPromptVisible(false);
  }, []);

  const closeTour = useCallback(async () => {
    await updateTourStateAction("DISMISS");
    setTourActive(false);
    window.sessionStorage.removeItem(ACTIVE_STEP_STORAGE_KEY);
  }, []);

  const next = useCallback(async () => {
    if (currentStepIndex >= steps.length - 1) {
      trackEvent(GA_EVENTS.ProductTourCompleted);
      await updateTourStateAction("COMPLETE");
      setTourActive(false);
      window.sessionStorage.removeItem(ACTIVE_STEP_STORAGE_KEY);
      return;
    }
    goToStep(currentStepIndex + 1);
  }, [currentStepIndex, goToStep, steps.length]);

  const previous = useCallback(() => {
    if (currentStepIndex <= 0) return;
    goToStep(currentStepIndex - 1);
  }, [currentStepIndex, goToStep]);

  const value = useMemo<TourContextValue>(
    () => ({ steps, isPromptVisible, isTourActive, currentStepIndex, startTour, dismissPrompt, next, previous, closeTour }),
    [steps, isPromptVisible, isTourActive, currentStepIndex, startTour, dismissPrompt, next, previous, closeTour],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

/** Exposé pour "Relancer la visite guidée" (mission §25.83) — redémarre toujours depuis l'étape 1,
 *  quel que soit l'état précédent (terminée ou non). */
export function useTour(): TourContextValue & { restartTour: () => void } {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error("useTour must be used within a TourProvider");
  }
  return { ...context, restartTour: context.startTour };
}
