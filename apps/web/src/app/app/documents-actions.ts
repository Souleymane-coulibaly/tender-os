"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { DocumentSummary } from "../../lib/documents-types";
import { apiErrorMessage } from "../../lib/api-error-messages";

export type FormActionState = { error?: string };

/** Mission Sprint 8A.2 (correction bug #10 "erreurs techniques affichées brutes") — même motif
 *  que `describeExportActionError` (export-actions.ts) : ne laisse jamais `error.message` (texte
 *  backend brut, souvent en anglais) atteindre un composant. */
function describeDocumentActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(
      `[TenderOS] Document action failed (${error.status} ${error.code}): ${error.message}`,
    );
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
        return error.status >= 500
          ? "Une erreur serveur est survenue. Veuillez réessayer."
          : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a document action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

function optional(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredFile(formData: FormData): File | undefined {
  const file = formData.get("file");
  return file instanceof File && file.size > 0 ? file : undefined;
}

export async function createDocumentAction(
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const title = formData.get("title");
  const origin = formData.get("origin");
  const domain = formData.get("domain");
  const file = requiredFile(formData);

  if (typeof title !== "string" || !title.trim()) {
    return { error: "Le titre est obligatoire." };
  }
  if (typeof origin !== "string" || !origin) {
    return { error: "L'origine est obligatoire." };
  }
  if (typeof domain !== "string" || !domain) {
    return { error: "Le domaine est obligatoire." };
  }
  if (!file) {
    return { error: "Un fichier est requis." };
  }

  const body = new FormData();
  body.set("title", title.trim());
  body.set("origin", origin);
  body.set("domain", domain);
  const description = optional(formData.get("description"));
  const category = optional(formData.get("category"));
  if (description) body.set("description", description);
  if (category) body.set("category", category);
  body.set("file", file);

  let document: DocumentSummary;
  try {
    document = await appApiFetch<DocumentSummary>("/api/v1/documents", { method: "POST", body });
  } catch (error) {
    return { error: describeDocumentActionError(error) };
  }

  revalidatePath("/app/documents");
  redirect(`/app/documents/${document.id}`);
}

export async function addDocumentVersionAction(
  documentId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const file = requiredFile(formData);
  if (!file) {
    return { error: "Un fichier est requis." };
  }

  const body = new FormData();
  body.set("file", file);

  try {
    await appApiFetch(`/api/v1/documents/${documentId}/versions`, { method: "POST", body });
  } catch (error) {
    return { error: describeDocumentActionError(error) };
  }

  revalidatePath(`/app/documents/${documentId}`);
  return {};
}

export async function updateDocumentMetadataAction(
  documentId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    await appApiFetch(`/api/v1/documents/${documentId}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: optional(formData.get("title")),
        description: optional(formData.get("description")),
        domain: optional(formData.get("domain")),
        category: optional(formData.get("category")),
      }),
    });
  } catch (error) {
    return { error: describeDocumentActionError(error) };
  }

  revalidatePath(`/app/documents/${documentId}`);
  return {};
}

export async function archiveDocumentAction(documentId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/documents/${documentId}/archive`, { method: "POST" });
  } catch (error) {
    return { error: describeDocumentActionError(error) };
  }

  revalidatePath(`/app/documents/${documentId}`);
  revalidatePath("/app/documents");
  return {};
}

export async function restoreDocumentAction(documentId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/documents/${documentId}/restore`, { method: "POST" });
  } catch (error) {
    return { error: describeDocumentActionError(error) };
  }

  revalidatePath(`/app/documents/${documentId}`);
  revalidatePath("/app/documents");
  return {};
}

export async function deleteDocumentAction(documentId: string): Promise<void> {
  await appApiFetch(`/api/v1/documents/${documentId}`, { method: "DELETE" });
  revalidatePath("/app/documents");
  redirect("/app/documents");
}

// ---- Association avec un Tender ----

export async function attachExistingDocumentToTenderAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const documentId = formData.get("documentId");
  if (typeof documentId !== "string" || !documentId.trim()) {
    return { error: "Identifiant du document requis." };
  }

  try {
    await appApiFetch(`/api/v1/documents/${documentId.trim()}/tenders/${tenderId}`, {
      method: "POST",
    });
  } catch (error) {
    return { error: describeDocumentActionError(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

/** Compose deux appels — creation puis association — pour offrir un depot en une seule etape
 *  depuis la fiche Tender, sans introduire de nouvelle route backend (le contrat Documents
 *  reste "creer" et "associer" comme deux operations distinctes, conception §D). */
export async function uploadAndAttachDocumentToTenderAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const title = formData.get("title");
  const category = optional(formData.get("category"));
  const file = requiredFile(formData);

  if (typeof title !== "string" || !title.trim()) {
    return { error: "Le titre est obligatoire." };
  }
  if (!file) {
    return { error: "Un fichier est requis." };
  }

  const body = new FormData();
  body.set("title", title.trim());
  body.set("origin", "USER_UPLOAD");
  body.set("domain", "TENDER");
  if (category) body.set("category", category);
  body.set("file", file);

  let document: DocumentSummary;
  try {
    document = await appApiFetch<DocumentSummary>("/api/v1/documents", { method: "POST", body });
    await appApiFetch(`/api/v1/documents/${document.id}/tenders/${tenderId}`, { method: "POST" });
  } catch (error) {
    return { error: describeDocumentActionError(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function detachDocumentFromTenderAction(
  tenderId: string,
  documentId: string,
): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/documents/${documentId}/tenders/${tenderId}`, { method: "DELETE" });
  } catch (error) {
    return { error: describeDocumentActionError(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

/**
 * Recherche dans la bibliothèque pour le sélecteur « Rattacher un document existant » — remplace la
 * saisie d'un identifiant technique. Seuls les documents ACTIFS sont proposés : rattacher un
 * document archivé à un appel d'offres n'a pas de sens. 10 résultats au plus, triés par titre.
 */
export async function searchLibraryDocumentsAction(
  query: string,
): Promise<{ value: string; label: string; description?: string }[]> {
  const params = new URLSearchParams({
    search: query,
    status: "ACTIVE",
    limit: "10",
    sort: "title",
    sortDirection: "asc",
  });
  const page = await appApiFetch<{ items: readonly DocumentSummary[] }>(
    "/api/v1/documents?" + params.toString(),
  );
  return page.items.map((document) => ({
    value: document.id,
    label: document.title,
    ...(document.category ? { description: document.category } : {}),
  }));
}
