"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { ExternalTenderSummary, SavedSearchCriteria, SavedSearchMatchSummary, SavedSearchSummary } from "../../lib/market-watch-types";
import { apiErrorMessage } from "../../lib/api-error-messages";

function describeMarketWatchActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Market watch action failed (${error.status} ${error.code}): ${error.message}`);
    // Sentinelle lue par l'écran (proposition de doublon), jamais affichée telle quelle.
    if (error.code === "EXTERNAL_TENDER_ALREADY_PROMOTED") return "ALREADY_PROMOTED";
    const known = apiErrorMessage(error);
    if (known) return known;
    switch (error.status) {
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action.";
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
  console.error("[TenderOS] Unexpected error during a market watch action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function fetchSavedSearches(): Promise<SavedSearchSummary[]> {
  return appApiFetch<SavedSearchSummary[]>("/api/v1/market-watch/saved-searches");
}

export async function fetchSavedSearch(savedSearchId: string): Promise<SavedSearchSummary> {
  return appApiFetch<SavedSearchSummary>(`/api/v1/market-watch/saved-searches/${savedSearchId}`);
}

export async function fetchSavedSearchMatches(savedSearchId: string, cursor?: string): Promise<{ items: SavedSearchMatchSummary[]; nextCursor: string | null }> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return appApiFetch(`/api/v1/market-watch/saved-searches/${savedSearchId}/matches${query}`);
}

export async function fetchExternalTender(externalTenderId: string): Promise<ExternalTenderSummary> {
  return appApiFetch<ExternalTenderSummary>(`/api/v1/market-watch/external-tenders/${externalTenderId}`);
}

export type CreateSavedSearchInput = {
  name: string;
  clientAccountId?: string;
  criteria: Partial<SavedSearchCriteria>;
  alertInApp: boolean;
  alertEmail: boolean;
  emailFrequency: "IMMEDIATE" | "DAILY_DIGEST";
};

export async function createSavedSearchAction(input: CreateSavedSearchInput): Promise<{ error?: string; savedSearch?: SavedSearchSummary }> {
  try {
    const savedSearch = await appApiFetch<SavedSearchSummary>("/api/v1/market-watch/saved-searches", { method: "POST", body: JSON.stringify(input) });
    revalidatePath("/app/market-watch");
    return { savedSearch };
  } catch (error) {
    return { error: describeMarketWatchActionError(error) };
  }
}

/** Checkpoint TENDEROS-2.1-P2.3-E10, mission §13.B "Tester la veille" — appelle le MÊME use case
 *  backend que le scheduler horaire (`RunSavedSearchNowUseCase`), jamais un pipeline dédié au
 *  bouton. Revalide la page Veille pour que les nouveaux résultats apparaissent immédiatement
 *  (mission §13.E), sans logout/hard refresh. */
export async function runSavedSearchNowAction(savedSearchId: string): Promise<{ error?: string; matchesFound?: number }> {
  try {
    const result = await appApiFetch<{ matchesFound: number }>(`/api/v1/market-watch/saved-searches/${savedSearchId}/run-now`, { method: "POST" });
    revalidatePath("/app/market-watch");
    revalidatePath("/app");
    return { matchesFound: result.matchesFound };
  } catch (error) {
    return { error: describeMarketWatchActionError(error) };
  }
}

export async function setSavedSearchStatusAction(savedSearchId: string, enabled: boolean): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/market-watch/saved-searches/${savedSearchId}/status`, { method: "POST", body: JSON.stringify({ enabled }) });
  } catch (error) {
    return { error: describeMarketWatchActionError(error) };
  }
  revalidatePath("/app/market-watch");
  return {};
}

export async function deleteSavedSearchAction(savedSearchId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/market-watch/saved-searches/${savedSearchId}/delete`, { method: "POST" });
  } catch (error) {
    return { error: describeMarketWatchActionError(error) };
  }
  revalidatePath("/app/market-watch");
  return {};
}

export async function setMatchStatusAction(savedSearchId: string, matchId: string, status: "NEW" | "INTERESTED" | "IGNORED"): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/market-watch/saved-searches/matches/${matchId}/status`, { method: "POST", body: JSON.stringify({ status }) });
  } catch (error) {
    return { error: describeMarketWatchActionError(error) };
  }
  revalidatePath(`/app/market-watch`);
  return {};
}

export async function promoteExternalTenderAction(
  externalTenderId: string,
  clientAccountId?: string,
  confirmDuplicate?: boolean,
): Promise<{ error?: string | undefined; opportunityId?: string | undefined; existingOpportunityId?: string | undefined }> {
  try {
    const result = await appApiFetch<{ id: string }>(`/api/v1/market-watch/saved-searches/external-tenders/${externalTenderId}/promote`, {
      method: "POST",
      body: JSON.stringify({ clientAccountId, confirmDuplicate }),
    });
    return { opportunityId: result.id };
  } catch (error) {
    if (error instanceof AppApiError && error.code === "EXTERNAL_TENDER_ALREADY_PROMOTED") {
      return { error: "ALREADY_PROMOTED", existingOpportunityId: error.details?.existingOpportunityId as string | undefined };
    }
    return { error: describeMarketWatchActionError(error) };
  }
}
