// Aides d'exécution des guides de page (et des cibles de la visite de bienvenue) — séparées du
// contrat `page-guides.ts` (contenu des guides) : ici uniquement la résolution des cibles dans le
// DOM et la lecture de l'état « déjà vu » renvoyé par l'API.

import { PAGE_GUIDES, PAGE_GUIDE_KEY_PATTERN, type PageGuide, type PageGuideKey, type PageGuideStep } from "./page-guides";

/** Registre des guides — injectable (tests, futurs guides) ; `PAGE_GUIDES` par défaut. */
export type PageGuideRegistry = Readonly<Record<PageGuideKey, PageGuide>>;

export type PageGuideAction = "COMPLETE" | "DISMISS";

export const PAGE_GUIDE_ACTIONS: readonly PageGuideAction[] = ["COMPLETE", "DISMISS"];

/** Élément d'état renvoyé par `GET /api/v1/auth/me/page-guides`. */
export type PageGuideStateItem = Readonly<{
  guideKey: string;
  completedAt?: string | null | undefined;
  dismissedAt?: string | null | undefined;
}>;

/** Sélecteur d'attribut `data-tour` — valeur échappée (jamais un sélecteur invalide qui lèverait). */
export function guideTargetSelector(target: string): string {
  return `[data-tour="${target.replace(/["\\]/g, "\\$&")}"]`;
}

/** Premier élément portant `data-tour="<target>"`, ou `null`. */
export function findGuideTarget(target: string, root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(guideTargetSelector(target));
}

/** Étapes dont la cible existe réellement à l'écran — un guide ne pointe jamais dans le vide
 *  (liste vide, action masquée pour ce rôle ou ce forfait). */
export function filterPresentSteps(steps: readonly PageGuideStep[], root: ParentNode = document): readonly PageGuideStep[] {
  return steps.filter((step) => findGuideTarget(step.target, root) !== null);
}

/** `true` dès qu'au moins une cible du guide est présente (un seul `querySelector`). */
export function hasPresentStep(steps: readonly PageGuideStep[], root: ParentNode = document): boolean {
  if (steps.length === 0) return false;
  return root.querySelector(steps.map((step) => guideTargetSelector(step.target)).join(",")) !== null;
}

export function isPageGuideKey(value: string): value is PageGuideKey {
  return PAGE_GUIDE_KEY_PATTERN.test(value) && Object.prototype.hasOwnProperty.call(PAGE_GUIDES, value);
}

export function isPageGuideAction(value: string): value is PageGuideAction {
  return (PAGE_GUIDE_ACTIONS as readonly string[]).includes(value);
}

/** Clés « déjà vues » (terminées OU ignorées) — les clés inconnues de ce frontend sont écartées. */
export function seenGuideKeysFromItems(items: readonly PageGuideStateItem[]): PageGuideKey[] {
  return items.filter((item) => Boolean(item.completedAt ?? item.dismissedAt) && isPageGuideKey(item.guideKey)).map((item) => item.guideKey as PageGuideKey);
}
