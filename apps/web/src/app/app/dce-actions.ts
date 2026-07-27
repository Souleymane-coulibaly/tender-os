"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { DceDocumentSummary, DceImportResult, DceSummary } from "../../lib/dce-types";

export type FormActionState = { error?: string };
export type ImportActionState = { error?: string; result?: DceImportResult };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Une erreur est survenue.";
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
    return { error: errorMessage(error) };
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
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return { result };
}

export async function importDceZipAction(
  tenderId: string,
  _prevState: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const archive = requiredFile(formData, "archive");
  if (!archive) {
    return { error: "Une archive ZIP est requise." };
  }

  const body = new FormData();
  body.set("archive", archive);

  let result: DceImportResult;
  try {
    result = await appApiFetch<DceImportResult>(`/api/v1/tenders/${tenderId}/dce/import-zip`, {
      method: "POST",
      body,
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return { result };
}

export async function deleteDceDocumentAction(tenderId: string, documentId: string): Promise<FormActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/dce/documents/${documentId}`, { method: "DELETE" });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}
