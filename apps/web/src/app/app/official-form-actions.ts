"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { ConsortiumSummary, OfficialFormGeneratedDocumentSummary, OfficialFormReadiness } from "../../lib/official-form-types";
import { apiErrorMessage } from "../../lib/api-error-messages";

export type FormActionState = { error?: string };

/** Ne laisse jamais un message backend brut atteindre un composant — même motif que
 *  `describeDocumentGenerationActionError`. */
function describeOfficialFormActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Official form action failed (${error.status} ${error.code}): ${error.message}`);
    const known = apiErrorMessage(error);
    if (known) return known;
    switch (error.status) {
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action.";
      case 404:
        return "Introuvable ou accès refusé.";
      case 422:
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during an official form action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

// ---- DC1 ----

export async function fetchDc1Readiness(tenderId: string): Promise<OfficialFormReadiness> {
  return appApiFetch<OfficialFormReadiness>(`/api/v1/tenders/${tenderId}/official-forms/dc1/readiness`);
}

export async function generateDc1Action(tenderId: string): Promise<FormActionState & { generated?: OfficialFormGeneratedDocumentSummary }> {
  let generated: OfficialFormGeneratedDocumentSummary;
  try {
    generated = await appApiFetch<OfficialFormGeneratedDocumentSummary>(`/api/v1/tenders/${tenderId}/official-forms/dc1/generate`, { method: "POST" });
  } catch (error) {
    return { error: describeOfficialFormActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/administrative-dossier`);
  return { generated };
}

// ---- DC2 (candidat OU membre de groupement explicite — mission §9) ----

export async function fetchDc2CandidateReadiness(tenderId: string): Promise<OfficialFormReadiness> {
  return appApiFetch<OfficialFormReadiness>(`/api/v1/tenders/${tenderId}/official-forms/dc2/candidate/readiness`);
}

export async function generateDc2CandidateAction(tenderId: string): Promise<FormActionState & { generated?: OfficialFormGeneratedDocumentSummary }> {
  let generated: OfficialFormGeneratedDocumentSummary;
  try {
    generated = await appApiFetch<OfficialFormGeneratedDocumentSummary>(`/api/v1/tenders/${tenderId}/official-forms/dc2/candidate/generate`, { method: "POST" });
  } catch (error) {
    return { error: describeOfficialFormActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/administrative-dossier`);
  return { generated };
}

export async function fetchDc2MemberReadiness(tenderId: string, memberId: string): Promise<OfficialFormReadiness> {
  return appApiFetch<OfficialFormReadiness>(`/api/v1/tenders/${tenderId}/official-forms/dc2/members/${encodeURIComponent(memberId)}/readiness`);
}

export async function generateDc2MemberAction(tenderId: string, memberId: string): Promise<FormActionState & { generated?: OfficialFormGeneratedDocumentSummary }> {
  let generated: OfficialFormGeneratedDocumentSummary;
  try {
    generated = await appApiFetch<OfficialFormGeneratedDocumentSummary>(`/api/v1/tenders/${tenderId}/official-forms/dc2/members/${encodeURIComponent(memberId)}/generate`, { method: "POST" });
  } catch (error) {
    return { error: describeOfficialFormActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/administrative-dossier`);
  return { generated };
}

export async function fetchConsortium(tenderId: string): Promise<ConsortiumSummary | null> {
  return appApiFetch<ConsortiumSummary | null>(`/api/v1/tenders/${tenderId}/administrative-consortium`);
}

// ---- DC4 (par déclaration de sous-traitance — plusieurs possibles par Tender) ----

export type SubcontractorDeclarationLite = { id: string; subcontractorName: string };

export async function fetchSubcontractorDeclarations(tenderId: string): Promise<SubcontractorDeclarationLite[]> {
  return appApiFetch<SubcontractorDeclarationLite[]>(`/api/v1/tenders/${tenderId}/administrative-subcontractors`);
}

export async function fetchDc4Readiness(subcontractorDeclarationId: string): Promise<OfficialFormReadiness> {
  return appApiFetch<OfficialFormReadiness>(`/api/v1/subcontractor-declarations/${subcontractorDeclarationId}/official-forms/dc4/readiness`);
}

export async function generateDc4Action(tenderId: string, subcontractorDeclarationId: string): Promise<FormActionState & { generated?: OfficialFormGeneratedDocumentSummary }> {
  let generated: OfficialFormGeneratedDocumentSummary;
  try {
    generated = await appApiFetch<OfficialFormGeneratedDocumentSummary>(`/api/v1/subcontractor-declarations/${subcontractorDeclarationId}/official-forms/dc4/generate`, { method: "POST" });
  } catch (error) {
    return { error: describeOfficialFormActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/administrative-dossier`);
  return { generated };
}
