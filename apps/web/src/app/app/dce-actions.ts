"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { DceDocumentSummary, DceImportJobSummary, DceImportResult, DceSummary } from "../../lib/dce-types";
import { apiErrorMessage } from "../../lib/api-error-messages";

export type FormActionState = { error?: string };
export type ImportActionState = { error?: string; result?: DceImportResult };

/** Mission Sprint 8A.2 (correction bug #10 "erreurs techniques affichées brutes") — même motif
 *  que `describeExportActionError` (export-actions.ts) : ne laisse jamais `error.message` (texte
 *  backend brut, souvent en anglais) atteindre un composant. */
function describeDceActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] DCE action failed (${error.status} ${error.code}): ${error.message}`);
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
      case 413:
        return "Le fichier dépasse la taille maximale autorisée.";
      case 415:
        return "Ce type de fichier n'est pas pris en charge.";
      case 422:
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a DCE action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

function requiredFiles(formData: FormData): File[] {
  return formData.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

function requiredFile(formData: FormData, field: string): File | undefined {
  const file = formData.get(field);
  return file instanceof File && file.size > 0 ? file : undefined;
}

/**
 * GET /tenders/:id/dce renvoie un 404 tant qu'aucun DCE n'a ete initialise (mission Sprint 0 —
 * GetDceUseCase) : ce n'est pas une erreur de page, seulement l'etat "pas encore initialise".
 * Toute autre erreur (401/403/500...) continue de remonter normalement.
 */
export async function fetchDceForTender(tenderId: string): Promise<DceSummary | null> {
  try {
    return await appApiFetch<DceSummary>(`/api/v1/tenders/${tenderId}/dce`);
  } catch (error) {
    if (error instanceof AppApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/** Combine les deux lectures en une seule promesse sequentielle (le second appel depend du
 *  resultat du premier) pour rester compatible avec le `Promise.all` de la page Tender, dont
 *  toutes les entrees s'executent en parallele. */
export async function fetchDceSectionData(
  tenderId: string,
): Promise<{ dce: DceSummary | null; documents: DceDocumentSummary[] }> {
  const dce = await fetchDceForTender(tenderId);
  if (!dce) {
    return { dce: null, documents: [] };
  }
  const documents = await appApiFetch<DceDocumentSummary[]>(`/api/v1/tenders/${tenderId}/dce/documents`);
  return { dce, documents };
}

export async function initDceAction(tenderId: string): Promise<FormActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/dce`, { method: "POST" });
  } catch (error) {
    return { error: describeDceActionError(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function importDceFilesAction(
  tenderId: string,
  _prevState: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const files = requiredFiles(formData);
  if (files.length === 0) {
    return { error: "Au moins un fichier est requis." };
  }

  const body = new FormData();
  for (const file of files) {
    body.append("files", file);
  }

  let result: DceImportResult;
  try {
    result = await appApiFetch<DceImportResult>(`/api/v1/tenders/${tenderId}/dce/documents`, {
      method: "POST",
      body,
    });
  } catch (error) {
    return { error: describeDceActionError(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return { result };
}

export type DceImportJobActionState = { error?: string; job?: DceImportJobSummary };

/** Mission Sprint 8A.2 (correction bug #3 "import ZIP lourd échoue ou bloque") — ne fait plus
 *  qu'un déclenchement asynchrone : répond immédiatement avec le job à l'état CREATED, jamais une
 *  attente bloquante le temps de l'extraction/l'import (voir getDceImportJobAction pour le
 *  sondage côté composant client). */
export async function startDceZipImportAction(tenderId: string, formData: FormData): Promise<DceImportJobActionState> {
  const archive = requiredFile(formData, "archive");
  if (!archive) {
    return { error: "Une archive ZIP est requise." };
  }

  const body = new FormData();
  body.set("archive", archive);

  try {
    const job = await appApiFetch<DceImportJobSummary>(`/api/v1/tenders/${tenderId}/dce/import-zip`, {
      method: "POST",
      body,
    });
    return { job };
  } catch (error) {
    return { error: describeDceActionError(error) };
  }
}

export async function getDceImportJobAction(tenderId: string, jobId: string): Promise<DceImportJobActionState> {
  try {
    const job = await appApiFetch<DceImportJobSummary>(`/api/v1/tenders/${tenderId}/dce/import-jobs/${jobId}`);
    return { job };
  } catch (error) {
    return { error: describeDceActionError(error) };
  }
}

export async function deleteDceDocumentAction(tenderId: string, documentId: string): Promise<FormActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/dce/documents/${documentId}`, { method: "DELETE" });
  } catch (error) {
    return { error: describeDceActionError(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}
