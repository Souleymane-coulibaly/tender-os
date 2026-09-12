"use client";

import { createContext, useContext } from "react";
import type { PageGuideAction, PageGuideRegistry } from "../../lib/page-guide-runtime";
import type { PageGuideKey, PageGuideStep } from "../../lib/page-guides";

/** Guide en cours : étapes déjà filtrées sur les cibles présentes à l'écran au démarrage. */
export type ActivePageGuide = Readonly<{
  key: PageGuideKey;
  pageLabel: string;
  steps: readonly PageGuideStep[];
}>;

/**
 * Contrat du moteur des guides de page, fourni par `PageGuideProvider`
 * (`app/app/(protected)/page-guide-provider.tsx`). Défini ici, hors de `app/`, pour que les
 * composants partagés (`PageHeader` → bouton et bandeau) le consomment sans dépendre de la couche
 * application (actions serveur, visite de bienvenue).
 */
export type PageGuideContextValue = Readonly<{
  /** Registre des guides (contenu). */
  guides: PageGuideRegistry;
  /** `true` si le guide a été terminé ou ignoré — et pour TOUS les guides si l'état serveur est
   *  inconnu (jamais de bandeau sur une incertitude). */
  isSeen: (key: PageGuideKey) => boolean;
  /** Visite de bienvenue en cours : aucun guide de page ne démarre ni ne s'affiche en parallèle. */
  isGlobalTourActive: boolean;
  /** Bandeau « Bienvenue dans TenderOS » affiché : aucun bandeau de guide de page en même temps. */
  isWelcomePromptVisible: boolean;
  activeGuide: ActivePageGuide | null;
  currentStepIndex: number;
  /** Démarre (ou redémarre) un guide depuis l'étape 1. `false` si rien à montrer (aucune cible
   *  présente) ou si la visite de bienvenue est en cours. */
  start: (key: PageGuideKey) => boolean;
  /** Étape suivante ; sur la dernière (« Terminer ») : ferme et enregistre COMPLETE. */
  next: () => Promise<void>;
  previous: () => void;
  /** Passer / fermer / Escape : ferme et enregistre DISMISS. */
  close: () => Promise<void>;
  /** Enregistre l'action côté serveur, avec mise à jour locale immédiate (optimiste). Ne rejette
   *  jamais : un échec d'enregistrement n'a aucun effet visible. */
  record: (key: PageGuideKey, action: PageGuideAction) => Promise<void>;
}>;

export const PageGuideContext = createContext<PageGuideContextValue | null>(null);

/** `null` hors d'un `PageGuideProvider` (tests de page, surfaces hors `/app`) : les composants de
 *  guide ne rendent alors simplement rien, jamais une erreur. */
export function usePageGuides(): PageGuideContextValue | null {
  return useContext(PageGuideContext);
}
