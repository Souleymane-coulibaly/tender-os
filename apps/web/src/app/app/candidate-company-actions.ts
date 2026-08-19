"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { CandidateCompanyPage, CandidateCompanySummary, CandidateEstablishmentSummary } from "../../lib/candidate-company-types";

export type CandidateEstablishmentPage = { items: CandidateEstablishmentSummary[] };

export type CandidateCompanyActionState = { error?: string };

function describeCandidateCompanyActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] CandidateCompany action failed (${error.status} ${error.code}): ${error.message}`);
    switch (error.status) {
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action.";
      case 404:
        return "Cette entreprise candidate n'existe plus ou n'est plus accessible.";
      case 409:
        return "Une entreprise candidate avec ces identifiants existe déjà dans votre organisation.";
      case 422:
        return "Certains champs sont invalides (vérifiez le SIREN/SIRET).";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a CandidateCompany action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

function optional(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.trim();
}

export async function fetchCandidateCompanies(input?: { includeArchived?: boolean; limit?: number }): Promise<CandidateCompanyPage> {
  const query = new URLSearchParams({ limit: String(input?.limit ?? 100) });
  if (input?.includeArchived) query.set("includeArchived", "true");
  return appApiFetch<CandidateCompanyPage>(`/api/v1/candidate-companies?${query.toString()}`);
}

export async function fetchCandidateCompany(id: string): Promise<CandidateCompanySummary> {
  return appApiFetch<CandidateCompanySummary>(`/api/v1/candidate-companies/${id}`);
}

/** Checkpoint 2.1-A6.4 (DEFERRED-BE-04) — jusqu'ici absent : la fiche Candidate ne pouvait pas
 *  lister les établissements déjà ajoutés (voir le commentaire historique de la page détail). */
export async function fetchCandidateEstablishments(candidateCompanyId: string): Promise<CandidateEstablishmentPage> {
  return appApiFetch<CandidateEstablishmentPage>(`/api/v1/candidate-companies/${candidateCompanyId}/establishments`);
}

/** Best-effort — utilisé pour résoudre l'affichage du nom d'une CandidateCompany déjà rattachée à
 *  un Tender/Opportunity sans faire échouer la page si elle a depuis été archivée/introuvable
 *  (même discipline que ResolveCandidateIdentityUseCase côté backend, jamais un throw bloquant). */
export async function fetchCandidateCompanyOrNull(id: string): Promise<CandidateCompanySummary | null> {
  try {
    return await fetchCandidateCompany(id);
  } catch {
    return null;
  }
}

export async function createCandidateCompanyAction(_prevState: CandidateCompanyActionState, formData: FormData): Promise<CandidateCompanyActionState> {
  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    return { error: "Le nom est obligatoire." };
  }

  let company: CandidateCompanySummary;
  try {
    company = await appApiFetch<CandidateCompanySummary>("/api/v1/candidate-companies", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        legalName: optional(formData.get("legalName")),
        siren: optional(formData.get("siren")),
        vatNumber: optional(formData.get("vatNumber")),
        legalForm: optional(formData.get("legalForm")),
      }),
    });
  } catch (error) {
    return { error: describeCandidateCompanyActionError(error) };
  }

  revalidatePath("/app/candidate-companies");
  redirect(`/app/candidate-companies/${company.id}`);
}

export async function addCandidateEstablishmentAction(
  candidateCompanyId: string,
  _prevState: CandidateCompanyActionState,
  formData: FormData,
): Promise<CandidateCompanyActionState> {
  const siret = formData.get("siret");
  if (typeof siret !== "string" || siret.trim().length !== 14) {
    return { error: "Le SIRET doit comporter exactement 14 chiffres." };
  }

  try {
    await appApiFetch<CandidateEstablishmentSummary>(`/api/v1/candidate-companies/${candidateCompanyId}/establishments`, {
      method: "POST",
      body: JSON.stringify({
        siret: siret.trim(),
        label: optional(formData.get("label")),
        isPrincipal: formData.get("isPrincipal") === "on",
        addressLine: optional(formData.get("addressLine")),
        postalCode: optional(formData.get("postalCode")),
        city: optional(formData.get("city")),
        country: optional(formData.get("country")),
      }),
    });
  } catch (error) {
    return { error: describeCandidateCompanyActionError(error) };
  }

  revalidatePath(`/app/candidate-companies/${candidateCompanyId}`);
  return {};
}
