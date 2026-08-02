"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { ExportJobSummary, ExportTemplateSummary, ExportTemplateVersionSummary } from "../../lib/export-types";

export type FormActionState = { error?: string };

function describeExportActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Export action failed (${error.status} ${error.code}): ${error.message}`);
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
        if (error.code === "EXPORT_TEMPLATE_VERSION_ACTIVATION_CONFLICT") return "Une autre version vient d'être activée simultanément ; rechargez et réessayez.";
        if (error.code === "DUPLICATE_EXPORT_TEMPLATE") return "Un template existe déjà pour ce type de document.";
        return "Cette action entre en conflit avec l'état actuel de la ressource.";
      case 422:
        if (error.code === "CROSS_CLIENT_CONTENT") return "Une section référence du contenu d'un autre client — refusé.";
        if (error.code === "INVALID_SECTION_SELECTION") return "La sélection de sections est invalide.";
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
