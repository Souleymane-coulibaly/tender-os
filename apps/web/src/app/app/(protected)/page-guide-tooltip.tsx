"use client";

import { usePageGuides } from "../../../components/page-guide/page-guide-context";
import { GuideTooltipPanel } from "./guide-tooltip-panel";

/**
 * Panneau du guide de page en cours — même panneau que la visite de bienvenue
 * (`GuideTooltipPanel`), placé sous/au-dessus de l'élément de la page, qui est amené à l'écran.
 * Libellé de fermeture distinct (« Fermer le guide de la page ») pour distinguer les deux guides.
 */
export function PageGuideTooltip() {
  const context = usePageGuides();
  const activeGuide = context?.activeGuide ?? null;
  const step = activeGuide?.steps[context?.currentStepIndex ?? 0];

  if (!context || !activeGuide || !step) return null;

  return (
    <GuideTooltipPanel
      key={activeGuide.key}
      idPrefix="page-guide-tooltip"
      anchor="auto"
      scrollTargetIntoView
      target={step.target}
      title={step.title}
      body={step.body}
      stepIndex={context.currentStepIndex}
      stepCount={activeGuide.steps.length}
      closeLabel="Fermer le guide de la page"
      onNext={context.next}
      onPrevious={context.previous}
      onClose={context.close}
    />
  );
}
