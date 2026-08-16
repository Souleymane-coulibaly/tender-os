"use server";

import { appApiFetch } from "../../lib/app-api-client";

export type TourAction = "START" | "COMPLETE" | "DISMISS";

/**
 * V2 Sprint 25 (Guide interactif) — mission §25.82 "User-scoped" : aucun `X-Organization-Id`
 * particulier n'a d'importance ici (le backend ignore le contexte organisation pour cet appel),
 * mais `appApiFetch` l'ajoute systématiquement comme pour tout appel authentifié — sans incidence,
 * `POST /auth/me/tour-state` ne le lit jamais.
 */
export async function updateTourStateAction(action: TourAction): Promise<{ error?: string }> {
  try {
    await appApiFetch("/api/v1/auth/me/tour-state", { method: "POST", body: JSON.stringify({ action }) });
  } catch {
    return { error: "Une erreur est survenue." };
  }
  return {};
}
