"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { CostComparison, PreviewGenerationCostResult, PricingEstimateSummary } from "../../lib/pricing-types";
import { apiErrorMessage } from "../../lib/api-error-messages";

export type FormActionState = { error?: string };

export type PricingAssumptionsInput = {
  taskTypes?: string[] | undefined;
  estimatedGenerationsCount?: number | undefined;
  estimatedInputTokensPerGeneration?: number | undefined;
  estimatedOutputTokensPerGeneration?: number | undefined;
  workHours?: number | undefined;
  hourlyRate?: string | undefined;
  headcount?: number | undefined;
  additionalFeesAmount?: string | undefined;
  notes?: string | undefined;
};

/** Messages français par statut HTTP — même motif que describeGenerationActionError. Ne jamais
 *  exposer une pile d'appel, un code Prisma brut, ou un détail fournisseur au frontend. */
function describePricingActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Pricing action failed (${error.status} ${error.code}): ${error.message}`);
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
        return "Certaines hypothèses sont invalides (vérifiez les montants et volumes saisis).";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a pricing action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function previewGenerationCostAction(
  tenderId: string,
  input: { taskType: string; estimatedGenerationsCount?: number; estimatedInputTokensPerGeneration?: number; estimatedOutputTokensPerGeneration?: number },
): Promise<{ error?: string; result?: PreviewGenerationCostResult }> {
  try {
    const result = await appApiFetch<PreviewGenerationCostResult>(`/api/v1/tenders/${tenderId}/pricing/preview`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return { result };
  } catch (error) {
    return { error: describePricingActionError(error) };
  }
}

export async function createPricingEstimateAction(
  tenderId: string,
  taskType: string | undefined,
  assumptions: PricingAssumptionsInput,
): Promise<{ error?: string; estimate?: PricingEstimateSummary }> {
  try {
    const estimate = await appApiFetch<PricingEstimateSummary>(`/api/v1/tenders/${tenderId}/pricing/estimates`, {
      method: "POST",
      body: JSON.stringify({ taskType, assumptions }),
    });
    revalidatePath(`/app/tenders/${tenderId}/pricing`);
    return { estimate };
  } catch (error) {
    return { error: describePricingActionError(error) };
  }
}

export async function recalculatePricingEstimateAction(
  tenderId: string,
  estimateId: string,
  taskType: string | undefined,
  assumptions: PricingAssumptionsInput,
  reason: string,
): Promise<{ error?: string; estimate?: PricingEstimateSummary }> {
  try {
    const estimate = await appApiFetch<PricingEstimateSummary>(`/api/v1/pricing/estimates/${estimateId}/recalculate`, {
      method: "POST",
      body: JSON.stringify({ taskType, assumptions, reason }),
    });
    revalidatePath(`/app/tenders/${tenderId}/pricing`);
    return { estimate };
  } catch (error) {
    return { error: describePricingActionError(error) };
  }
}

/** Mission Sprint 7 §"Comparaison estimé/réel" — consultation seule (jamais de recalcul), réutilise
 *  la route backend existante `GET /pricing/estimates/:id/comparison`. */
export async function getPricingEstimateComparisonAction(estimateId: string): Promise<{ error?: string; comparison?: CostComparison }> {
  try {
    const comparison = await appApiFetch<CostComparison>(`/api/v1/pricing/estimates/${estimateId}/comparison`);
    return { comparison };
  } catch (error) {
    return { error: describePricingActionError(error) };
  }
}

/** Mission Sprint 7 §"Historique" — consulte une version passée d'une estimation sans jamais la
 *  recalculer, réutilise la route backend existante `GET /pricing/estimates/:id?version=N`. */
export async function getPricingEstimateVersionAction(
  estimateId: string,
  version: number,
): Promise<{ error?: string; estimate?: PricingEstimateSummary }> {
  try {
    const estimate = await appApiFetch<PricingEstimateSummary>(`/api/v1/pricing/estimates/${estimateId}?version=${version}`);
    return { estimate };
  } catch (error) {
    return { error: describePricingActionError(error) };
  }
}

export async function archivePricingEstimateAction(tenderId: string, estimateId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/pricing/estimates/${estimateId}/archive`, { method: "POST" });
  } catch (error) {
    return { error: describePricingActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/pricing`);
  return {};
}
