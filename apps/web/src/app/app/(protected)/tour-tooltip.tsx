"use client";

import { GuideTooltipPanel } from "./guide-tooltip-panel";
import { useTour } from "./tour-provider";

/**
 * V2 Sprint 25 (Guide interactif) — mission §25.86 (targets stables `data-tour`) / §25.89
 * (accessibilité : clavier, Escape, focus, aria, contraste, responsive, reduced motion) / §25.90
 * (mobile 390px, jamais hors écran) / §25.88 (Suivant/Précédent/Passer/Fermer). Le panneau, son
 * placement (à droite du lien du menu latéral) et son accessibilité sont partagés avec les guides
 * de page (`GuideTooltipPanel`) — jamais une seconde implémentation.
 */
export function TourTooltip() {
  const { steps, isTourActive, currentStepIndex, next, previous, closeTour } = useTour();
  const step = steps[currentStepIndex];

  if (!isTourActive || !step) return null;

  return (
    <GuideTooltipPanel
      idPrefix="tour-tooltip"
      anchor="beside"
      target={step.target}
      title={step.title}
      body={step.body}
      stepIndex={currentStepIndex}
      stepCount={steps.length}
      closeLabel="Fermer la visite guidée"
      onNext={next}
      onPrevious={previous}
      onClose={closeTour}
    />
  );
}
