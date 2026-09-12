"use client";

import type { PageGuideKey } from "../../lib/page-guides";
import { Button } from "../ui/button";
import { usePageGuides } from "./page-guide-context";
import { useGuideTargetsPresent } from "./use-guide-targets-present";

/**
 * Bandeau de première visite, sous l'en-tête de page — non modal, jamais forcé (même esprit que
 * `WelcomeTourPrompt`). Affiché uniquement si le guide n'a été ni terminé ni ignoré (état serveur
 * CONNU), qu'au moins une cible est à l'écran, et que ni la visite de bienvenue ni son bandeau ni
 * un autre guide ne sont affichés. « Plus tard » enregistre DISMISS : plus jamais reproposé.
 */
export function PageGuideBanner({ guideKey }: { guideKey: PageGuideKey }) {
  const context = usePageGuides();
  const guide = context?.guides[guideKey];
  const present = useGuideTargetsPresent(guide?.steps);

  if (!context || !guide || !present) return null;
  if (context.isSeen(guideKey) || context.isGlobalTourActive || context.isWelcomePromptVisible || context.activeGuide) return null;

  return (
    <div
      role="region"
      aria-label={`Guide de la page ${guide.pageLabel}`}
      className="flex flex-col items-start gap-3 rounded-2xl border border-tenderos-gold/30 bg-tenderos-gold/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-tenderos-navy">
        <span className="font-semibold">Nouveau sur {guide.pageLabel} ?</span> Découvrez-la en quelques étapes.
      </p>
      <div className="flex shrink-0 gap-2">
        <Button variant="secondary" size="sm" aria-haspopup="dialog" onClick={() => context.start(guideKey)}>
          Découvrir
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void context.record(guideKey, "DISMISS")}>
          Plus tard
        </Button>
      </div>
    </div>
  );
}
