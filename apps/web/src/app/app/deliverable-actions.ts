"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { DeliverableCommentSummary, DeliverableRevisionSummary, RenderableBlock } from "../../lib/deliverable-types";

export type FormActionState = { error?: string };

function describeDeliverableActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Deliverable action failed (${error.status} ${error.code}): ${error.message}`);
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
        if (error.code === "DELIVERABLE_REVISION_EDIT_CONFLICT") return "Cette révision a été modifiée par quelqu'un d'autre entre-temps. Rechargez la page et réappliquez vos changements.";
        if (error.code === "IMMUTABLE_DELIVERABLE_REVISION") return "Cette révision n'est plus modifiable — créez-en une nouvelle.";
        if (error.code === "DELIVERABLE_TEMPLATE_VERSION_ACTIVATION_CONFLICT" || error.code === "DOCUMENT_THEME_VERSION_ACTIVATION_CONFLICT")
          return "Une autre version vient d'être activée simultanément ; rechargez et réessayez.";
        return "Cette action entre en conflit avec l'état actuel de la ressource.";
      case 422:
        if (error.code === "DELIVERABLE_REVISION_NOT_VALIDATED_FOR_EXPORT") return "Seule une révision validée peut être sélectionnée pour l'export.";
        if (error.code === "SECTION_TASK_TYPE_NOT_CONFIGURED") return "Aucun type de génération IA n'est configuré pour cette section.";
        if (error.code === "GENERATION_NOT_USABLE_FOR_REVISION") return "Cette génération n'est pas utilisable pour créer une révision (pas encore terminée, ou d'une autre section/client).";
        if (error.code === "DELIVERABLE_NOT_READY_FOR_APPROVAL") return "Toutes les sections visibles doivent être validées avant d'approuver ce livrable.";
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a deliverable action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function listSectionRevisionsAction(sectionId: string): Promise<{ error?: string; revisions?: DeliverableRevisionSummary[] }> {
  try {
    const revisions = await appApiFetch<DeliverableRevisionSummary[]>(`/api/v1/deliverable-sections/${sectionId}/revisions`);
    return { revisions };
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
}

export async function getGenerationStatusAction(generationId: string): Promise<{ error?: string; status?: string; generatedContent?: string }> {
  try {
    const generation = await appApiFetch<{ status: string; generatedContent?: string }>(`/api/v1/generations/${generationId}`);
    return { status: generation.status, ...(generation.generatedContent !== undefined ? { generatedContent: generation.generatedContent } : {}) };
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
}

export async function compareRevisionsAction(
  sectionId: string,
  fromRevisionId: string,
  toRevisionId: string,
): Promise<{ error?: string; addedLines?: string[]; removedLines?: string[] }> {
  try {
    const result = await appApiFetch<{ addedLines: string[]; removedLines: string[] }>(
      `/api/v1/deliverable-sections/${sectionId}/compare?fromRevisionId=${fromRevisionId}&toRevisionId=${toRevisionId}`,
    );
    return { addedLines: result.addedLines, removedLines: result.removedLines };
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
}

export async function generateSectionAction(tenderId: string, sectionId: string, taskType?: string): Promise<{ error?: string; generationId?: string }> {
  try {
    const generation = await appApiFetch<{ id: string }>(`/api/v1/deliverable-sections/${sectionId}/generate`, {
      method: "POST",
      body: JSON.stringify(taskType ? { taskType } : {}),
    });
    return { generationId: generation.id };
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
}

export async function createRevisionFromGenerationAction(
  tenderId: string,
  deliverableId: string,
  sectionId: string,
  generationId: string,
): Promise<{ error?: string; revision?: DeliverableRevisionSummary }> {
  try {
    const revision = await appApiFetch<DeliverableRevisionSummary>(`/api/v1/deliverable-sections/${sectionId}/revisions/from-generation`, {
      method: "POST",
      body: JSON.stringify({ generationId }),
    });
    revalidatePath(`/app/tenders/${tenderId}/deliverables/${deliverableId}`);
    return { revision };
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
}

export async function createManualRevisionAction(
  tenderId: string,
  deliverableId: string,
  sectionId: string,
  content: RenderableBlock[],
): Promise<{ error?: string; revision?: DeliverableRevisionSummary }> {
  try {
    const revision = await appApiFetch<DeliverableRevisionSummary>(`/api/v1/deliverable-sections/${sectionId}/revisions`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    revalidatePath(`/app/tenders/${tenderId}/deliverables/${deliverableId}`);
    return { revision };
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
}

export async function saveRevisionDraftAction(
  tenderId: string,
  deliverableId: string,
  sectionId: string,
  revisionId: string,
  content: RenderableBlock[],
  expectedEditVersion: number,
): Promise<{ error?: string; revision?: DeliverableRevisionSummary }> {
  try {
    const revision = await appApiFetch<DeliverableRevisionSummary>(`/api/v1/deliverable-sections/${sectionId}/revisions/${revisionId}`, {
      method: "PATCH",
      body: JSON.stringify({ content, expectedEditVersion }),
    });
    revalidatePath(`/app/tenders/${tenderId}/deliverables/${deliverableId}`);
    return { revision };
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
}

export async function submitRevisionForReviewAction(tenderId: string, deliverableId: string, sectionId: string, revisionId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/deliverable-sections/${sectionId}/revisions/${revisionId}/submit-review`, { method: "POST" });
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/deliverables/${deliverableId}`);
  return {};
}

export async function decideRevisionReviewAction(
  tenderId: string,
  deliverableId: string,
  sectionId: string,
  revisionId: string,
  decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED",
  comment?: string,
): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/deliverable-sections/${sectionId}/revisions/${revisionId}/review`, {
      method: "POST",
      body: JSON.stringify({ decision, ...(comment ? { comment } : {}) }),
    });
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/deliverables/${deliverableId}`);
  return {};
}

export async function selectRevisionForExportAction(tenderId: string, deliverableId: string, sectionId: string, revisionId: string, justification?: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/deliverable-sections/${sectionId}/revisions/${revisionId}/select-for-export`, {
      method: "POST",
      body: JSON.stringify(justification ? { justification } : {}),
    });
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/deliverables/${deliverableId}`);
  return {};
}

export async function restoreRevisionAction(tenderId: string, deliverableId: string, sectionId: string, sourceRevisionId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/deliverable-sections/${sectionId}/revisions/restore`, {
      method: "POST",
      body: JSON.stringify({ sourceRevisionId }),
    });
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/deliverables/${deliverableId}`);
  return {};
}

export async function previewDeliverableAction(tenderId: string, deliverableId: string): Promise<{ error?: string; jobId?: string }> {
  try {
    const job = await appApiFetch<{ id: string }>(`/api/v1/deliverables/${deliverableId}/preview`, { method: "POST" });
    return { jobId: job.id };
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
}

/** Mission §15 — APPROVED est un fait explicite, refusé (422) tant qu'une section visible n'est
 *  pas VALIDÉE. */
export async function approveDeliverableAction(tenderId: string, deliverableId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/deliverables/${deliverableId}/approve`, { method: "POST" });
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/deliverables/${deliverableId}`);
  return {};
}

export async function addDeliverableCommentAction(
  tenderId: string,
  deliverableId: string,
  content: string,
  sectionId?: string,
  revisionId?: string,
): Promise<{ error?: string; comment?: DeliverableCommentSummary }> {
  try {
    const comment = await appApiFetch<DeliverableCommentSummary>(`/api/v1/deliverables/${deliverableId}/comments`, {
      method: "POST",
      body: JSON.stringify({ content, ...(sectionId ? { deliverableSectionId: sectionId } : {}), ...(revisionId ? { deliverableRevisionId: revisionId } : {}) }),
    });
    revalidatePath(`/app/tenders/${tenderId}/deliverables/${deliverableId}`);
    return { comment };
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
}

export async function resolveDeliverableCommentAction(tenderId: string, deliverableId: string, commentId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/deliverables/${deliverableId}/comments/${commentId}/resolve`, { method: "POST" });
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/deliverables/${deliverableId}`);
  return {};
}

export async function createComplianceMatrixEntryAction(
  tenderId: string,
  deliverableId: string,
  input: { source: string; mandatory: boolean; criticality: string; requirementId?: string },
): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/deliverables/${deliverableId}/compliance-matrix`, { method: "POST", body: JSON.stringify(input) });
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/deliverables/${deliverableId}`);
  return {};
}

export async function updateComplianceMatrixEntryAction(
  tenderId: string,
  deliverableId: string,
  entryId: string,
  input: { response?: string; coverageStatus?: string; proofReference?: string },
): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/deliverables/${deliverableId}/compliance-matrix/${entryId}`, { method: "PATCH", body: JSON.stringify(input) });
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/deliverables/${deliverableId}`);
  return {};
}

export async function createChecklistPieceEntryAction(
  tenderId: string,
  deliverableId: string,
  input: { name: string; mandatory: boolean; source?: string; format?: string },
): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/deliverables/${deliverableId}/checklist`, { method: "POST", body: JSON.stringify(input) });
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/deliverables/${deliverableId}`);
  return {};
}

export async function createDeliverableAnnexAction(tenderId: string, deliverableId: string, input: { label: string; source?: string }): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/deliverables/${deliverableId}/annexes`, { method: "POST", body: JSON.stringify(input) });
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/deliverables/${deliverableId}`);
  return {};
}

// --- Templates de mémoire (mission §5) — gestion réservée OWNER/ORGANIZATION_ADMIN ---

export type DeliverableTemplateSummary = {
  id: string;
  scopeLevel: string;
  documentType: string;
  name: string;
  description?: string;
  note?: string;
  activeVersion?: { id: string; version: number; status: string; sections: unknown[] };
  versions?: { id: string; version: number; status: string; sections: unknown[] }[];
};

export async function createDeliverableTemplateAction(
  documentType: string,
  name: string,
  sectionsText: string,
): Promise<{ error?: string; template?: DeliverableTemplateSummary }> {
  let sections: unknown;
  try {
    sections = JSON.parse(sectionsText.trim() || "[]");
  } catch {
    return { error: "Les sections doivent être un JSON valide." };
  }
  try {
    const template = await appApiFetch<DeliverableTemplateSummary>("/api/v1/deliverable-templates", {
      method: "POST",
      body: JSON.stringify({ scopeLevel: "ORGANIZATION", documentType, name, sections }),
    });
    revalidatePath("/app/ai-configuration/deliverable-templates");
    return { template };
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
}

export async function createDeliverableTemplateVersionAction(templateId: string, sectionsText: string): Promise<{ error?: string; version?: { id: string; version: number; status: string } }> {
  let sections: unknown;
  try {
    sections = JSON.parse(sectionsText.trim() || "[]");
  } catch {
    return { error: "Les sections doivent être un JSON valide." };
  }
  try {
    const version = await appApiFetch<{ id: string; version: number; status: string }>(`/api/v1/deliverable-templates/${templateId}/versions`, {
      method: "POST",
      body: JSON.stringify({ sections }),
    });
    revalidatePath(`/app/ai-configuration/deliverable-templates/${templateId}`);
    return { version };
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
}

export async function activateDeliverableTemplateVersionAction(templateId: string, versionId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/deliverable-templates/${templateId}/versions/${versionId}/activate`, { method: "POST" });
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
  revalidatePath(`/app/ai-configuration/deliverable-templates/${templateId}`);
  revalidatePath("/app/ai-configuration/deliverable-templates");
  return {};
}

// --- Identité documentaire (mission §6) — gestion réservée OWNER/ORGANIZATION_ADMIN ---

export type DocumentThemeSummary = {
  id: string;
  scopeLevel: string;
  name: string;
  activeVersion?: { id: string; version: number; status: string; accentColor?: string; fontFamily?: string };
  versions?: { id: string; version: number; status: string }[];
};

export async function createDocumentThemeAction(name: string, accentColor: string, fontFamily: string): Promise<{ error?: string; theme?: DocumentThemeSummary }> {
  try {
    const theme = await appApiFetch<DocumentThemeSummary>("/api/v1/document-themes", {
      method: "POST",
      body: JSON.stringify({ scopeLevel: "ORGANIZATION", name, ...(accentColor ? { accentColor } : {}), ...(fontFamily ? { fontFamily } : {}) }),
    });
    revalidatePath("/app/ai-configuration/document-themes");
    return { theme };
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
}

export async function createDocumentThemeVersionAction(themeId: string, accentColor: string, fontFamily: string): Promise<{ error?: string; version?: { id: string; version: number; status: string } }> {
  try {
    const version = await appApiFetch<{ id: string; version: number; status: string }>(`/api/v1/document-themes/${themeId}/versions`, {
      method: "POST",
      body: JSON.stringify({ ...(accentColor ? { accentColor } : {}), ...(fontFamily ? { fontFamily } : {}) }),
    });
    revalidatePath(`/app/ai-configuration/document-themes/${themeId}`);
    return { version };
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
}

export async function activateDocumentThemeVersionAction(themeId: string, versionId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/document-themes/${themeId}/versions/${versionId}/activate`, { method: "POST" });
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
  revalidatePath(`/app/ai-configuration/document-themes/${themeId}`);
  revalidatePath("/app/ai-configuration/document-themes");
  return {};
}

/** Mission §4 — verrouiller bloque toute nouvelle révision/édition ; masquer exclut la section du
 *  calcul du statut global et du contenu final assemblé. */
export async function updateDeliverableSectionAction(
  tenderId: string,
  deliverableId: string,
  sectionId: string,
  input: { locked?: boolean; hidden?: boolean },
): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/deliverable-sections/${sectionId}`, { method: "PATCH", body: JSON.stringify(input) });
  } catch (error) {
    return { error: describeDeliverableActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/deliverables/${deliverableId}`);
  return {};
}
