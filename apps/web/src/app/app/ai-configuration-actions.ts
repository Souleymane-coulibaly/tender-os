"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type {
  AiModelSummary,
  BenchmarkCostEstimate,
  BenchmarkRunSummary,
  BenchmarkSuiteSummary,
  ModelRecommendationSummary,
  PricingSnapshotSummary,
  RoutingPolicySummary,
} from "../../lib/ai-configuration-types";

export type FormActionState = { error?: string };

/** Messages français par statut HTTP — même motif que describeClientPortfolioActionError. Ne
 *  jamais exposer une pile d'appel, un code Prisma brut, ou un détail fournisseur au frontend. */
function describeAiConfigurationActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] AI configuration action failed (${error.status} ${error.code}): ${error.message}`);
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
        if (error.code === "DUPLICATE_AI_MODEL") return "Ce modèle est déjà enregistré dans le registre.";
        if (error.code === "PRICING_SNAPSHOT_OVERLAP") return "Un tarif est déjà en vigueur pour ce modèle.";
        if (error.code === "BENCHMARK_SUITE_NOT_DRAFT") return "Cette suite est déjà publiée : créez une nouvelle version pour la modifier.";
        if (error.code === "BENCHMARK_RUN_NOT_CANCELLABLE") return "Ce benchmark a déjà atteint un état final : annulation impossible.";
        if (error.code === "MODEL_RECOMMENDATION_NOT_DRAFT") return "Cette recommandation a déjà été approuvée ou rejetée.";
        return "Cette action entre en conflit avec l'état actuel de la ressource.";
      case 422:
        if (error.code === "MODEL_KEY_NOT_ALLOWED") return "Ce modèle ne fait pas partie de la liste autorisée.";
        if (error.code === "AI_MODEL_DISABLED") return "Ce modèle est désactivé.";
        if (error.code === "BENCHMARK_SUITE_EMPTY") return "Ajoutez au moins un cas avant de publier cette suite.";
        if (error.code === "AI_MODEL_NOT_ENABLED_FOR_BENCHMARK") return "Ce modèle n'est pas autorisé pour les benchmarks.";
        if (error.code === "BENCHMARK_COST_CEILING_EXCEEDED") return "Le coût estimé dépasse le plafond autorisé pour ce lancement.";
        if (error.code === "PRICING_SNAPSHOT_NOT_FOUND") return "Aucun tarif actif pour l'un des modèles sélectionnés.";
        if (error.code === "BENCHMARK_RUN_NOT_COMPLETED") return "Ce benchmark doit être terminé avant de générer une recommandation.";
        if (error.code === "NO_ADMISSIBLE_MODEL") return "Tous les modèles de ce benchmark ont été éliminés : aucune recommandation possible.";
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

export async function createBenchmarkSuiteAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const name = formData.get("name");
  const promptKey = formData.get("promptKey");
  if (typeof name !== "string" || !name.trim()) return { error: "Le nom de la suite est obligatoire." };
  if (typeof promptKey !== "string" || !promptKey.trim()) return { error: "Sélectionnez une tâche IA." };

  let suite: BenchmarkSuiteSummary;
  try {
    suite = await appApiFetch<BenchmarkSuiteSummary>("/api/v1/ai-benchmark/suites", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        promptKey,
        description: (() => {
          const description = formData.get("description");
          return typeof description === "string" && description.trim() ? description.trim() : undefined;
        })(),
      }),
    });
  } catch (error) {
    return { error: describeAiConfigurationActionError(error) };
  }

  revalidatePath("/app/ai-configuration/benchmarks");
  redirect(`/app/ai-configuration/benchmarks/${suite.id}`);
}

export async function publishBenchmarkSuiteAction(suiteId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/ai-benchmark/suites/${suiteId}/publish`, { method: "POST" });
  } catch (error) {
    return { error: describeAiConfigurationActionError(error) };
  }
  revalidatePath(`/app/ai-configuration/benchmarks/${suiteId}`);
  revalidatePath("/app/ai-configuration/benchmarks");
  return {};
}

export async function estimateBenchmarkRunCostAction(input: {
  suiteId: string;
  modelIds: string[];
  repetitions: number;
}): Promise<{ estimate?: BenchmarkCostEstimate; error?: string }> {
  try {
    const estimate = await appApiFetch<BenchmarkCostEstimate>("/api/v1/ai-benchmark/runs/estimate", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return { estimate };
  } catch (error) {
    return { error: describeAiConfigurationActionError(error) };
  }
}

export async function launchBenchmarkRunAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const suiteId = formData.get("suiteId");
  const modelIds = formData.getAll("modelIds");
  const repetitions = Number(formData.get("repetitions") ?? 1);
  const concurrencyLimit = Number(formData.get("concurrencyLimit") ?? 1);
  if (typeof suiteId !== "string" || !suiteId) return { error: "Suite introuvable." };
  if (modelIds.length === 0) return { error: "Sélectionnez au moins un modèle à comparer." };

  let run: BenchmarkRunSummary;
  try {
    run = await appApiFetch<BenchmarkRunSummary>("/api/v1/ai-benchmark/runs", {
      method: "POST",
      body: JSON.stringify({ suiteId, modelIds, repetitions, concurrencyLimit }),
    });
  } catch (error) {
    return { error: describeAiConfigurationActionError(error) };
  }

  revalidatePath("/app/ai-configuration/benchmarks");
  redirect(`/app/ai-configuration/benchmarks/runs/${run.id}`);
}

export async function cancelBenchmarkRunAction(runId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/ai-benchmark/runs/${runId}/cancel`, { method: "POST" });
  } catch (error) {
    return { error: describeAiConfigurationActionError(error) };
  }
  revalidatePath(`/app/ai-configuration/benchmarks/runs/${runId}`);
  return {};
}

export async function generateModelRecommendationAction(runId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch<ModelRecommendationSummary>("/api/v1/ai-benchmark/recommendations", {
      method: "POST",
      body: JSON.stringify({ runId }),
    });
  } catch (error) {
    return { error: describeAiConfigurationActionError(error) };
  }
  revalidatePath("/app/ai-configuration/recommendations");
  revalidatePath(`/app/ai-configuration/benchmarks/runs/${runId}`);
  return {};
}

export async function approveModelRecommendationAction(recommendationId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/ai-benchmark/recommendations/${recommendationId}/approve`, { method: "POST" });
  } catch (error) {
    return { error: describeAiConfigurationActionError(error) };
  }
  revalidatePath("/app/ai-configuration/recommendations");
  return {};
}

export async function rejectModelRecommendationAction(recommendationId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/ai-benchmark/recommendations/${recommendationId}/reject`, { method: "POST" });
  } catch (error) {
    return { error: describeAiConfigurationActionError(error) };
  }
  revalidatePath("/app/ai-configuration/recommendations");
  return {};
}

export async function createRoutingPolicyAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const promptKey = formData.get("promptKey");
  const primaryAiModelId = formData.get("primaryAiModelId");
  const escalationAiModelId = formData.get("escalationAiModelId");
  const timeoutMs = Number(formData.get("timeoutMs") ?? 30000);
  const maxRetries = Number(formData.get("maxRetries") ?? 1);
  const escalationConditions = formData.getAll("escalationConditions");
  if (typeof promptKey !== "string" || !promptKey) return { error: "Sélectionnez une tâche IA." };
  if (typeof primaryAiModelId !== "string" || !primaryAiModelId) return { error: "Sélectionnez un modèle principal." };

  let policy: RoutingPolicySummary;
  try {
    policy = await appApiFetch<RoutingPolicySummary>("/api/v1/ai-benchmark/routing-policies", {
      method: "POST",
      body: JSON.stringify({
        promptKey,
        primaryAiModelId,
        escalationAiModelId: typeof escalationAiModelId === "string" && escalationAiModelId ? escalationAiModelId : undefined,
        timeoutMs,
        maxRetries,
        escalationConditions,
      }),
    });
  } catch (error) {
    return { error: describeAiConfigurationActionError(error) };
  }

  revalidatePath("/app/ai-configuration/routing-policies");
  redirect(`/app/ai-configuration/routing-policies/${policy.id}`);
}

export async function activateRoutingPolicyAction(policyId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/ai-benchmark/routing-policies/${policyId}/activate`, { method: "POST" });
  } catch (error) {
    return { error: describeAiConfigurationActionError(error) };
  }
  revalidatePath("/app/ai-configuration/routing-policies");
  revalidatePath(`/app/ai-configuration/routing-policies/${policyId}`);
  return {};
}

export async function archiveRoutingPolicyAction(policyId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/ai-benchmark/routing-policies/${policyId}/archive`, { method: "POST" });
  } catch (error) {
    return { error: describeAiConfigurationActionError(error) };
  }
  revalidatePath("/app/ai-configuration/routing-policies");
  revalidatePath(`/app/ai-configuration/routing-policies/${policyId}`);
  return {};
}
