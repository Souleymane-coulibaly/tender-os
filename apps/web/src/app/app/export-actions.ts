"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { ExportCapabilities, ExportJobSummary, ExportTemplateSummary, ExportTemplateVersionSummary } from "../../lib/export-types";

export type FormActionState = { error?: string };

/** Messages métier précis par code (mission — "remplacer les messages génériques export par des
 *  messages précis"), même motif que `describeGenerationActionError` : un code métier connu
 *  gagne toujours sur le message générique du statut HTTP, jamais de détail interne ni d'ID exposé. */
function describeExportActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Export action failed (${error.status} ${error.code}): ${error.message}`);
    switch (error.code) {
      case "EXPORT_TEMPLATE_NOT_FOUND":
        return "Aucun modèle d'export valide n'est sélectionné.";
      case "NO_ACTIVE_EXPORT_TEMPLATE_VERSION":
        return "Aucune version de ce modèle n'est active.";
      case "EXPORT_TEMPLATE_VERSION_NOT_FOUND":
        return "La version de modèle sélectionnée n'existe plus.";
      case "EXPORT_JOB_NOT_FOUND":
        return "Cet export n'existe plus.";
      case "EXPORT_ARTIFACT_NOT_FOUND":
        return "Le document demandé n'existe plus.";
      case "EXPORT_NOT_FINAL":
        return "Cet export n'est pas encore finalisé.";
      case "EXPORT_BLOCKED":
        return "L'export est bloqué : les conditions requises ne sont pas encore réunies.";
      case "UNRELIABLE_RENDER":
        return "Le document généré n'a pas pu être vérifié de façon fiable ; réessayez.";
      case "INVALID_EXPORT_TEMPLATE_CONFIG":
        return "La configuration du modèle est invalide.";
      case "INVALID_EXPORT_TEMPLATE_VERSION_STATUS_TRANSITION":
        return "Cette version ne peut pas passer à cet état.";
      case "EXPORT_TEMPLATE_VERSION_ACTIVATION_CONFLICT":
        return "Une autre version vient d'être activée simultanément ; rechargez et réessayez.";
      case "DUPLICATE_EXPORT_TEMPLATE":
        return "Un template existe déjà pour ce type de document.";
      case "CROSS_CLIENT_CONTENT":
        return "Une section référence du contenu d'un autre client — refusé.";
      case "INVALID_SECTION_SELECTION":
        return "La sélection de sections est invalide.";
      default:
        break;
    }
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
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during an export action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function createExportTemplateAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const documentType = formData.get("documentType");
  const name = formData.get("name");
  const format = formData.get("format");
  const description = formData.get("description");
  const configRaw = formData.get("config");

  if (typeof documentType !== "string" || !documentType) return { error: "Le type de document est obligatoire." };
  if (typeof name !== "string" || !name.trim()) return { error: "Le nom est obligatoire." };
  if (typeof format !== "string" || !format) return { error: "Le format est obligatoire." };

  let config: unknown;
  try {
    config = JSON.parse(typeof configRaw === "string" && configRaw.trim() ? configRaw : "{}");
  } catch {
    return { error: "La configuration doit être un JSON valide." };
  }

  let template: ExportTemplateSummary;
  try {
    template = await appApiFetch<ExportTemplateSummary>("/api/v1/exports/templates", {
      method: "POST",
      body: JSON.stringify({ documentType, name: name.trim(), format, config, ...(typeof description === "string" && description.trim() ? { description: description.trim() } : {}) }),
    });
  } catch (error) {
    return { error: describeExportActionError(error) };
  }
  revalidatePath("/app/ai-configuration/export-templates");
  redirect(`/app/ai-configuration/export-templates/${template.id}`);
}

export async function createExportTemplateVersionAction(
  templateId: string,
  format: string,
  configText: string,
): Promise<{ error?: string; version?: ExportTemplateVersionSummary }> {
  let config: unknown;
  try {
    config = JSON.parse(configText.trim() || "{}");
  } catch {
    return { error: "La configuration doit être un JSON valide." };
  }
  try {
    const version = await appApiFetch<ExportTemplateVersionSummary>(`/api/v1/exports/templates/${templateId}/versions`, {
      method: "POST",
      body: JSON.stringify({ format, config }),
    });
    revalidatePath(`/app/ai-configuration/export-templates/${templateId}`);
    return { version };
  } catch (error) {
    return { error: describeExportActionError(error) };
  }
}

export async function activateExportTemplateVersionAction(templateId: string, versionId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/exports/templates/${templateId}/versions/${versionId}/activate`, { method: "POST" });
  } catch (error) {
    return { error: describeExportActionError(error) };
  }
  revalidatePath(`/app/ai-configuration/export-templates/${templateId}`);
  revalidatePath("/app/ai-configuration/export-templates");
  return {};
}

/** Mission — "le frontend doit savoir avant le clic si l'export est possible". */
export async function fetchExportCapabilities(tenderId: string): Promise<ExportCapabilities> {
  return appApiFetch<ExportCapabilities>(`/api/v1/tenders/${tenderId}/export-capabilities`);
}

export type PreviewExportSectionInput = {
  sectionId: string;
  sourceType: string;
  generationId?: string;
  pricingEstimateId?: string;
  pricingEstimateVersionNumber?: number;
  manualContent?: string;
};

export async function previewExportAction(
  tenderId: string,
  exportTemplateId: string,
  sections: PreviewExportSectionInput[],
): Promise<{ error?: string; job?: ExportJobSummary }> {
  try {
    const job = await appApiFetch<ExportJobSummary>(`/api/v1/tenders/${tenderId}/exports/preview`, {
      method: "POST",
      body: JSON.stringify({ exportTemplateId, sections }),
    });
    revalidatePath(`/app/tenders/${tenderId}/export`);
    return { job };
  } catch (error) {
    return { error: describeExportActionError(error) };
  }
}
