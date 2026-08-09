"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { DocumentTemplateDetail, DocumentTemplateSummary, DocumentTemplateVersionSummary, GeneratedDocumentSummary } from "../../lib/document-generation-types";

export type FormActionState = { error?: string };

/** Ne laisse jamais un message backend brut atteindre un composant — même motif que
 *  `describeChatActionError`/`describeWorkspaceActionError`. */
function describeDocumentGenerationActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Document generation action failed (${error.status} ${error.code}): ${error.message}`);
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
        if (error.code === "REQUIRED_FIELDS_MISSING") return "Des champs obligatoires sont manquants et ce template n'autorise pas la génération partielle.";
        if (error.code === "INVALID_TEMPLATE_FILE") return "Le fichier n'est pas un template DOCX valide ou sûr.";
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a document generation action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

function optional(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// ---- Templates (gestion, palier organisation) ----

export async function fetchDocumentTemplates(): Promise<DocumentTemplateSummary[]> {
  return appApiFetch<DocumentTemplateSummary[]>("/api/v1/document-templates");
}

export async function fetchDocumentTemplate(templateId: string): Promise<DocumentTemplateDetail> {
  return appApiFetch<DocumentTemplateDetail>(`/api/v1/document-templates/${templateId}`);
}

export async function createDocumentTemplateAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const name = formData.get("name");
  const scope = formData.get("scope");
  const description = optional(formData.get("description"));

  if (typeof name !== "string" || !name.trim()) {
    return { error: "Le nom est obligatoire." };
  }

  try {
    await appApiFetch("/api/v1/document-templates", { method: "POST", body: JSON.stringify({ name: name.trim(), scope: scope === "SYSTEM" ? "SYSTEM" : "ORGANIZATION", description }) });
  } catch (error) {
    return { error: describeDocumentGenerationActionError(error) };
  }
  revalidatePath("/app/ai-configuration/document-templates");
  return {};
}

export type UploadTemplateVersionFieldMapping = { fieldKey: string; label: string; fieldType: string; required: boolean };

export async function uploadDocumentTemplateVersionAction(
  templateId: string,
  fieldMappings: UploadTemplateVersionFieldMapping[],
  allowPartialGeneration: boolean,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState & { version?: DocumentTemplateVersionSummary }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Un fichier .docx est requis." };
  }

  const body = new FormData();
  body.set("file", file);
  body.set("fieldMappings", JSON.stringify(fieldMappings));
  body.set("allowPartialGeneration", allowPartialGeneration ? "true" : "false");

  let version: DocumentTemplateVersionSummary;
  try {
    version = await appApiFetch<DocumentTemplateVersionSummary>(`/api/v1/document-templates/${templateId}/versions`, { method: "POST", body });
  } catch (error) {
    return { error: describeDocumentGenerationActionError(error) };
  }
  revalidatePath(`/app/ai-configuration/document-templates`);
  return { version };
}

export async function activateDocumentTemplateVersionAction(templateId: string, versionId: string): Promise<FormActionState> {
  try {
    await appApiFetch(`/api/v1/document-templates/${templateId}/versions/${versionId}/activate`, { method: "POST" });
  } catch (error) {
    return { error: describeDocumentGenerationActionError(error) };
  }
  revalidatePath("/app/ai-configuration/document-templates");
  return {};
}

// ---- Génération (palier Tender/client) ----

export async function fetchGeneratedDocuments(tenderId: string): Promise<GeneratedDocumentSummary[]> {
  return appApiFetch<GeneratedDocumentSummary[]>(`/api/v1/tenders/${tenderId}/documents/generated`);
}

export async function fetchGeneratedDocument(generatedDocumentId: string): Promise<GeneratedDocumentSummary> {
  return appApiFetch<GeneratedDocumentSummary>(`/api/v1/generated-documents/${generatedDocumentId}`);
}

export async function generateDocumentAction(
  tenderId: string,
  input: { documentTemplateId: string; title?: string | undefined; data: Record<string, unknown> },
): Promise<FormActionState & { generated?: GeneratedDocumentSummary }> {
  let generated: GeneratedDocumentSummary;
  try {
    generated = await appApiFetch<GeneratedDocumentSummary>(`/api/v1/tenders/${tenderId}/documents/generate`, { method: "POST", body: JSON.stringify(input) });
  } catch (error) {
    return { error: describeDocumentGenerationActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/documents-generated`);
  return { generated };
}

export async function regenerateDocumentAction(
  tenderId: string,
  generatedDocumentId: string,
  data: Record<string, unknown>,
): Promise<FormActionState & { generated?: GeneratedDocumentSummary }> {
  let generated: GeneratedDocumentSummary;
  try {
    generated = await appApiFetch<GeneratedDocumentSummary>(`/api/v1/generated-documents/${generatedDocumentId}/regenerate`, { method: "POST", body: JSON.stringify({ data }) });
  } catch (error) {
    return { error: describeDocumentGenerationActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/documents-generated`);
  return { generated };
}
