"use client";

import type { PageGuideKey } from "../../lib/page-guides";
import { Button } from "../ui/button";
import { usePageGuides } from "./page-guide-context";
import { useGuideTargetsPresent } from "./use-guide-targets-present";

/**
 * « Guide de cette page » — (re)démarre le guide à tout moment, depuis l'étape 1. Rendu dans les
 * actions de `PageHeader` (prop `guideKey`). Masqué hors `PageGuideProvider` et tant qu'aucune
 * cible du guide n'est présente à l'écran ; désactivé pendant la visite de bienvenue.
 */
export function PageGuideButton({ guideKey }: { guideKey: PageGuideKey }) {
  const context = usePageGuides();
  const present = useGuideTargetsPresent(context?.guides[guideKey].steps);

  if (!context || !present) return null;

  return (
    <Button variant="ghost" size="sm" aria-haspopup="dialog" disabled={context.isGlobalTourActive} onClick={() => context.start(guideKey)}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6.3 6.2C6.4 5.3 7.1 4.7 8 4.7C9 4.7 9.7 5.4 9.7 6.2C9.7 7.4 8 7.5 8 8.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="8" cy="11.2" r="0.85" fill="currentColor" />
      </svg>
      Guide de cette page
    </Button>
  );
}
