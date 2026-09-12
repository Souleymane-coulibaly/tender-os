"use server";

import { appApiFetch } from "../../lib/app-api-client";
import { isPageGuideAction, seenGuideKeysFromItems, type PageGuideAction, type PageGuideStateItem } from "../../lib/page-guide-runtime";
import { PAGE_GUIDE_KEY_PATTERN, type PageGuideKey } from "../../lib/page-guides";

/**
 * Guides de page — clés déjà vues (terminées ou ignorées) par l'utilisateur courant. État
 * user-scoped côté API ; `appApiFetch` ajoute `X-Organization-Id` comme pour tout appel
 * authentifié, sans incidence (même motif que `tour-actions.ts`).
 *
 * `null` = état inconnu (erreur réseau/API, réponse inattendue) : l'appelant considère alors tous
 * les guides comme vus — jamais de bandeau affiché sur une incertitude. Ne lève jamais.
 */
export async function fetchSeenPageGuides(): Promise<PageGuideKey[] | null> {
  try {
    const page = await appApiFetch<{ items?: PageGuideStateItem[] } | null>("/api/v1/auth/me/page-guides");
    if (!page || !Array.isArray(page.items)) return null;
    return seenGuideKeysFromItems(page.items);
  } catch {
    return null;
  }
}

/** Enregistre « terminé » (COMPLETE) ou « ignoré » (DISMISS) pour un guide. Jamais d'exception
 *  renvoyée au client : un échec d'enregistrement ne doit jamais casser l'interface. */
export async function recordPageGuideAction(guideKey: string, action: PageGuideAction): Promise<{ error?: string }> {
  if (typeof guideKey !== "string" || !PAGE_GUIDE_KEY_PATTERN.test(guideKey) || typeof action !== "string" || !isPageGuideAction(action)) {
    return { error: "Guide inconnu." };
  }
  try {
    await appApiFetch(`/api/v1/auth/me/page-guides/${encodeURIComponent(guideKey)}`, { method: "POST", body: JSON.stringify({ action }) });
  } catch {
    return { error: "Une erreur est survenue." };
  }
  return {};
}
