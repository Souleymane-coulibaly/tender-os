"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type {
  FinancialDocumentType,
  PricingControlsResult,
  PricingSchedule,
  PricingScheduleFinalFile,
  PricingScheduleLine,
  PricingScheduleVersion,
} from "../../lib/pricing-schedule-types";
import { apiErrorMessage } from "../../lib/api-error-messages";

export type PricingScheduleActionState = { error?: string };

/** Ne laisse jamais un message backend brut atteindre un composant — même motif que
 *  `describeTechnicalMemoActionError`/`describeChatActionError`. */
function describePricingScheduleActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Pricing schedule action failed (${error.status} ${error.code}): ${error.message}`);
    const known = apiErrorMessage(error);
    if (known) return known;
    switch (error.status) {
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action sur le chiffrage.";
      case 404:
        return "Introuvable ou accès refusé.";
      case 409:
        return "Cette action entre en conflit avec l'état actuel de la ressource.";
      case 422:
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a pricing schedule action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function fetchPricingSchedules(tenderId: string, lotId?: string): Promise<PricingSchedule[]> {
  const query = lotId ? `?lotId=${encodeURIComponent(lotId)}` : "";
  return appApiFetch<PricingSchedule[]>(`/api/v1/tenders/${tenderId}/pricing-schedules${query}`);
}

export async function fetchPricingSchedule(
  pricingScheduleId: string,
  versionId?: string,
): Promise<{ schedule: PricingSchedule; versions: PricingScheduleVersion[]; lines: PricingScheduleLine[] }> {
  const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
  return appApiFetch<{ schedule: PricingSchedule; versions: PricingScheduleVersion[]; lines: PricingScheduleLine[] }>(`/api/v1/pricing-schedules/${pricingScheduleId}${query}`);
}

export async function fetchPricingScheduleControls(pricingScheduleId: string, versionId: string): Promise<PricingControlsResult> {
  return appApiFetch<PricingControlsResult>(`/api/v1/pricing-schedules/${pricingScheduleId}/versions/${versionId}/controls`);
}

export async function createPricingScheduleAction(
  tenderId: string,
  input: { sourceDocumentId: string; lotId?: string | undefined; financialDocumentTypeOverride?: FinancialDocumentType | undefined },
): Promise<PricingScheduleActionState & { schedule?: PricingSchedule }> {
  try {
    const schedule = await appApiFetch<PricingSchedule>(`/api/v1/tenders/${tenderId}/pricing-schedules`, { method: "POST", body: JSON.stringify(input) });
    revalidatePath(`/app/tenders/${tenderId}/pricing-schedule`);
    return { schedule };
  } catch (error) {
    return { error: describePricingScheduleActionError(error) };
  }
}

export async function extractPricingScheduleVersionAction(
  tenderId: string,
  pricingScheduleId: string,
  sourceDocumentVersionId: string,
): Promise<PricingScheduleActionState & { version?: PricingScheduleVersion; lines?: PricingScheduleLine[] }> {
  try {
    const result = await appApiFetch<{ version: PricingScheduleVersion; lines: PricingScheduleLine[] }>(`/api/v1/pricing-schedules/${pricingScheduleId}/extract`, {
      method: "POST",
      body: JSON.stringify({ sourceDocumentVersionId }),
    });
    revalidatePath(`/app/tenders/${tenderId}/pricing-schedule`);
    return result;
  } catch (error) {
    return { error: describePricingScheduleActionError(error) };
  }
}

export async function setPricingScheduleLineUnitPriceAction(
  tenderId: string,
  pricingScheduleId: string,
  lineId: string,
  unitPrice: string,
): Promise<PricingScheduleActionState & { line?: PricingScheduleLine }> {
  try {
    const line = await appApiFetch<PricingScheduleLine>(`/api/v1/pricing-schedules/${pricingScheduleId}/lines/${lineId}/price`, { method: "PATCH", body: JSON.stringify({ unitPrice }) });
    revalidatePath(`/app/tenders/${tenderId}/pricing-schedule`);
    return { line };
  } catch (error) {
    return { error: describePricingScheduleActionError(error) };
  }
}

export async function setPricingScheduleLineCommentAction(
  tenderId: string,
  pricingScheduleId: string,
  lineId: string,
  candidateComment: string,
): Promise<PricingScheduleActionState & { line?: PricingScheduleLine }> {
  try {
    const line = await appApiFetch<PricingScheduleLine>(`/api/v1/pricing-schedules/${pricingScheduleId}/lines/${lineId}/comment`, {
      method: "PATCH",
      body: JSON.stringify({ candidateComment: candidateComment || undefined }),
    });
    revalidatePath(`/app/tenders/${tenderId}/pricing-schedule`);
    return { line };
  } catch (error) {
    return { error: describePricingScheduleActionError(error) };
  }
}

export async function validatePricingScheduleVersionAction(
  tenderId: string,
  pricingScheduleId: string,
  versionId: string,
  overrideJustification?: string,
): Promise<PricingScheduleActionState & { version?: PricingScheduleVersion }> {
  try {
    const version = await appApiFetch<PricingScheduleVersion>(`/api/v1/pricing-schedules/${pricingScheduleId}/versions/${versionId}/validate`, {
      method: "POST",
      body: JSON.stringify(overrideJustification ? { overrideJustification } : {}),
    });
    revalidatePath(`/app/tenders/${tenderId}/pricing-schedule`);
    return { version };
  } catch (error) {
    return { error: describePricingScheduleActionError(error) };
  }
}

/** Action EXPLICITE et SÉPARÉE de la validation (mission — "Validate → puis → Generate", jamais
 *  automatique). */
export async function generatePricingScheduleFinalFileAction(
  tenderId: string,
  pricingScheduleId: string,
  versionId: string,
): Promise<PricingScheduleActionState & { finalFile?: PricingScheduleFinalFile }> {
  try {
    const finalFile = await appApiFetch<PricingScheduleFinalFile>(`/api/v1/pricing-schedules/${pricingScheduleId}/versions/${versionId}/generate`, { method: "POST" });
    revalidatePath(`/app/tenders/${tenderId}/pricing-schedule`);
    return { finalFile };
  } catch (error) {
    return { error: describePricingScheduleActionError(error) };
  }
}
