"use client";

import { useEffect, useState } from "react";
import { hasPresentStep } from "../../lib/page-guide-runtime";
import type { PageGuideStep } from "../../lib/page-guides";

/**
 * `true` quand au moins une cible du guide est présente dans le DOM — `false` au premier rendu
 * (serveur compris : aucune hydratation divergente), puis vérifié après montage et à chaque
 * changement du DOM (contenu chargé ou retiré après coup), au plus une fois par frame.
 */
export function useGuideTargetsPresent(steps: readonly PageGuideStep[] | undefined): boolean {
  const [present, setPresent] = useState(false);

  useEffect(() => {
    if (!steps || steps.length === 0) {
      setPresent(false);
      return;
    }
    let frame = 0;
    const check = () => setPresent(hasPresentStep(steps));
    check();
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(check);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tour"] });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [steps]);

  return present;
}
