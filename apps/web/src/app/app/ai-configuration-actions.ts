"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { AiModelSummary, PricingSnapshotSummary } from "../../lib/ai-configuration-types";
import { apiErrorMessage } from "../../lib/api-error-messages";

export type FormActionState = { error?: string };

/** Messages français par statut HTTP — même motif que describeClientPortfolioActionError. Ne
 *  jamais exposer une pile d'appel, un code Prisma brut, ou un détail fournisseur au frontend. */
function describeAiConfigurationActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] AI configuration action failed (${error.status} ${error.code}): ${error.message}`);
    const known = apiErrorMessage(error);
    if (known) return known;
    switch (error.status) {
      case 400:
        return "Certains champs sont invalides.";
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action.";
      case 404:
        return "Ressource introuvable.";
      case 409:
        return "Cette action entre en conflit avec l'état actuel de la ressource.";
      case 422:
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during an AI configuration action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function createAiModelAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const provider = formData.get("provider");
  const modelKey = formData.get("modelKey");
  const displayName = formData.get("displayName");
  if (typeof provider !== "string" || !provider.trim()) return { error: "Sélectionnez un fournisseur." };
  if (typeof modelKey !== "string" || !modelKey.trim()) return { error: "Sélectionnez un modèle dans la liste autorisée." };
  if (typeof displayName !== "string" || !displayName.trim()) return { error: "Le nom affiché est obligatoire." };

  let model: AiModelSummary;
  try {
    model = await appApiFetch<AiModelSummary>("/api/v1/ai-models", {
      method: "POST",
      body: JSON.stringify({
        provider,
        modelKey,
        displayName: displayName.trim(),
        enabledForBenchmark: formData.get("enabledForBenchmark") === "on",
        enabledForProduction: formData.get("enabledForProduction") === "on",
      }),
    });
  } catch (error) {
    return { error: describeAiConfigurationActionError(error) };
  }

  revalidatePath("/app/ai-configuration/models");
  redirect(`/app/ai-configuration/models/${model.id}`);
}

/** Mission — correctif "Production autorisée" jamais modifiable après la création d'un modèle
 *  (seule une case à cocher au moment de `createAiModelAction`, aucun contrôle ensuite dans
 *  l'interface, alors que le backend le permettait déjà via `PATCH /ai-models/:modelId`). */
export async function updateAiModelProductionAction(modelId: string, enabledForProduction: boolean): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/ai-models/${modelId}`, {
      method: "PATCH",
      body: JSON.stringify({ enabledForProduction }),
    });
  } catch (error) {
    return { error: describeAiConfigurationActionError(error) };
  }
  revalidatePath("/app/ai-configuration/models");
  revalidatePath(`/app/ai-configuration/models/${modelId}`);
  return {};
}

export async function enableAiModelAction(modelId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/ai-models/${modelId}/enable`, { method: "POST" });
  } catch (error) {
    return { error: describeAiConfigurationActionError(error) };
  }
  revalidatePath("/app/ai-configuration/models");
  revalidatePath(`/app/ai-configuration/models/${modelId}`);
  return {};
}

export async function disableAiModelAction(modelId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/ai-models/${modelId}/disable`, { method: "POST" });
  } catch (error) {
    return { error: describeAiConfigurationActionError(error) };
  }
  revalidatePath("/app/ai-configuration/models");
  revalidatePath(`/app/ai-configuration/models/${modelId}`);
  return {};
}

export async function addPricingSnapshotAction(
  modelId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const inputPrice = formData.get("inputPricePerMillionTokens");
  const outputPrice = formData.get("outputPricePerMillionTokens");
  const currency = formData.get("currency");
  if (typeof inputPrice !== "string" || !inputPrice.trim()) return { error: "Le tarif d'entrée est obligatoire." };
  if (typeof outputPrice !== "string" || !outputPrice.trim()) return { error: "Le tarif de sortie est obligatoire." };
  if (typeof currency !== "string" || currency.trim().length !== 3) return { error: "La devise doit être un code ISO à 3 lettres." };

  try {
    await appApiFetch<PricingSnapshotSummary>(`/api/v1/ai-models/${modelId}/pricing`, {
      method: "POST",
      body: JSON.stringify({
        inputPricePerMillionTokens: inputPrice.trim(),
        outputPricePerMillionTokens: outputPrice.trim(),
        currency: currency.trim().toUpperCase(),
      }),
    });
  } catch (error) {
    return { error: describeAiConfigurationActionError(error) };
  }

  revalidatePath(`/app/ai-configuration/models/${modelId}`);
  return {};
}
