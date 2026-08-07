"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { AiSuggestion, ConflictResolution } from "../../lib/ai-suggestion-types";

export type MapSuggestionsResult = { analysisVersion?: number; alreadyMapped: boolean; createdCount: number; skippedCount: number };

export type AiSuggestionActionState = { error?: string; conflict?: boolean };

/** Même motif que `describeAnalysisActionError` — ne laisse jamais un message backend brut
 *  atteindre un composant. `AI_SUGGESTION_TARGET_CONFLICT` (409) n'est PAS traité comme une
 *  erreur générique par les appelants : voir `applySuggestionAction`, qui le distingue via
 *  `state.conflict` pour que le composant propose une décision plutôt qu'un simple message. */
function describeAiSuggestionActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] AiSuggestion action failed (${error.status} ${error.code}): ${error.message}`);
    switch (error.status) {
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action.";
      case 404:
        return "Cette suggestion n'existe plus ou n'est plus accessible.";
      case 409:
        if (error.code === "AI_SUGGESTION_ALREADY_PROCESSED") return "Cette suggestion a déjà été traitée.";
        return "Cette action entre en conflit avec l'état actuel de la ressource.";
      case 422:
        if (error.code === "AI_SUGGESTION_MERGE_NOT_ALLOWED") return "La fusion n'est pas autorisée pour ce champ — choisissez conserver ou remplacer.";
        if (error.code === "AI_SUGGESTION_BRIDGE_UNSUPPORTED_ENTITY_TYPE") return "Ce type de suggestion ne peut pas encore être appliqué automatiquement.";
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during an AiSuggestion action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function fetchTenderSuggestions(tenderId: string): Promise<AiSuggestion[]> {
  return appApiFetch<AiSuggestion[]>(`/api/v1/tenders/${tenderId}/analysis/suggestions?status=PENDING`);
}

/** Déclenche le mapping Finding -> AiSuggestion (mission §9-12) — jamais automatique, toujours une
 *  action explicite de l'utilisateur, jamais appelé au fil de l'analyse elle-même. */
export async function mapSuggestionsAction(tenderId: string): Promise<{ result?: MapSuggestionsResult; error?: string }> {
  try {
    const result = await appApiFetch<MapSuggestionsResult>(`/api/v1/tenders/${tenderId}/analysis/map-suggestions`, { method: "POST" });
    revalidatePath(`/app/tenders/${tenderId}`);
    return { result };
  } catch (error) {
    return { error: describeAiSuggestionActionError(error) };
  }
}

/** Seul chemin qui écrit réellement une donnée métier à partir d'une suggestion IA (mission
 *  "jamais un remplacement silencieux") — sans `conflictResolution`, une cible déjà renseignée
 *  renvoie 409 AI_SUGGESTION_TARGET_CONFLICT : le composant appelant doit alors proposer une
 *  décision explicite (conserver / remplacer / fusionner) avant de rappeler cette action. */
export async function applySuggestionAction(tenderId: string, suggestionId: string, conflictResolution?: ConflictResolution): Promise<AiSuggestionActionState> {
  try {
    await appApiFetch(`/api/v1/ai-suggestions/${suggestionId}/apply`, {
      method: "POST",
      body: JSON.stringify(conflictResolution ? { conflictResolution } : {}),
    });
  } catch (error) {
    if (error instanceof AppApiError && error.status === 409 && error.code === "AI_SUGGESTION_TARGET_CONFLICT") {
      return { conflict: true };
    }
    return { error: describeAiSuggestionActionError(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function rejectSuggestionAction(tenderId: string, suggestionId: string, reason?: string): Promise<AiSuggestionActionState> {
  try {
    await appApiFetch(`/api/v1/ai-suggestions/${suggestionId}/reject`, { method: "POST", body: JSON.stringify(reason ? { reason } : {}) });
  } catch (error) {
    return { error: describeAiSuggestionActionError(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}
