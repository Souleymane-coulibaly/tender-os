"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { AiModelPreferenceSummary, AiRoutingModelId } from "../../lib/ai-routing-types";
import { apiErrorMessage } from "../../lib/api-error-messages";

function describeAiRoutingActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] AI routing action failed (${error.status} ${error.code}): ${error.message}`);
    const known = apiErrorMessage(error);
    if (known) return known;
    switch (error.status) {
      case 403:
        return "Vous n'avez pas les droits nécessaires pour modifier ce réglage.";
      case 422:
        return "Ce modèle n'est pas compatible avec cette fonctionnalité.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during an AI routing action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function fetchAiModelPreferences(): Promise<AiModelPreferenceSummary[]> {
  const result = await appApiFetch<{ items: AiModelPreferenceSummary[] }>("/api/v1/ai-routing/preferences");
  return result.items;
}

export async function setAiModelPreferenceAction(taskType: string, modelOverride: AiRoutingModelId): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/ai-routing/preferences/${taskType}`, { method: "PUT", body: JSON.stringify({ modelOverride }) });
  } catch (error) {
    return { error: describeAiRoutingActionError(error) };
  }
  revalidatePath("/app/ai-configuration/model-preferences");
  return {};
}

export async function resetAiModelPreferenceAction(taskType: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/ai-routing/preferences/${taskType}`, { method: "DELETE" });
  } catch (error) {
    return { error: describeAiRoutingActionError(error) };
  }
  revalidatePath("/app/ai-configuration/model-preferences");
  return {};
}
