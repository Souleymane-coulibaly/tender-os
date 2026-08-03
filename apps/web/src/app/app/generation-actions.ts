"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { GenerationCapability, GenerationSummary, PromptTemplateSummary, PromptVersionSummary } from "../../lib/generation-types";

export type FormActionState = { error?: string };

/** Messages français par statut HTTP — même motif que describeAiConfigurationActionError. Ne
 *  jamais exposer une pile d'appel, un code Prisma brut, ou un détail fournisseur au frontend. */
function describeGenerationActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Generation action failed (${error.status} ${error.code}): ${error.message}`);
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
        if (error.code === "GENERATION_ALREADY_RUNNING") return "Une génération est déjà en cours pour cette tâche.";
        if (error.code === "PROMPT_VERSION_ACTIVATION_CONFLICT") return "Une autre activation est déjà en cours ; réessayez.";
        if (error.code === "DUPLICATE_PROMPT_TEMPLATE") return "Un template existe déjà pour ce type de tâche.";
        if (error.code === "NO_ACTIVE_PROMPT_VERSION") return "Aucune version de prompt active pour ce type de tâche.";
        if (error.code === "GENERATION_NOT_REJECTABLE") return "Seule une génération produite peut être rejetée.";
        if (error.code === "GENERATION_ALREADY_VALIDATED") return "Cette génération a déjà été validée et ne peut plus être rejetée.";
        if (error.code === "GENERATION_ALREADY_REJECTED") return "Cette génération a déjà été rejetée et ne peut plus être validée.";
        return "Cette action entre en conflit avec l'état actuel de la ressource.";
      case 422:
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a generation action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function createPromptTemplateAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const taskType = formData.get("taskType");
  const name = formData.get("name");
  const outputMode = formData.get("outputMode");
  if (typeof taskType !== "string" || !taskType.trim()) return { error: "Sélectionnez un type de tâche." };
  if (typeof name !== "string" || !name.trim()) return { error: "Le nom est obligatoire." };
  if (typeof outputMode !== "string" || !outputMode.trim()) return { error: "Sélectionnez un mode de sortie." };

  let template: PromptTemplateSummary;
  try {
    template = await appApiFetch<PromptTemplateSummary>("/api/v1/prompt-templates", {
      method: "POST",
      body: JSON.stringify({ taskType, name, outputMode }),
    });
  } catch (error) {
    return { error: describeGenerationActionError(error) };
  }

  revalidatePath("/app/ai-configuration/prompts");
  redirect(`/app/ai-configuration/prompts/${template.id}`);
}

export async function createPromptVersionAction(
  templateId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const systemPrompt = formData.get("systemPrompt");
  const userPromptTemplate = formData.get("userPromptTemplate");
  if (typeof systemPrompt !== "string" || !systemPrompt.trim()) return { error: "Le prompt système est obligatoire." };
  if (typeof userPromptTemplate !== "string" || !userPromptTemplate.trim()) return { error: "Le prompt utilisateur est obligatoire." };

  try {
    await appApiFetch<PromptVersionSummary>(`/api/v1/prompt-templates/${templateId}/versions`, {
      method: "POST",
      body: JSON.stringify({ systemPrompt, userPromptTemplate, requiredVariables: [] }),
    });
  } catch (error) {
    return { error: describeGenerationActionError(error) };
  }

  revalidatePath(`/app/ai-configuration/prompts/${templateId}`);
  return {};
}

export async function activatePromptVersionAction(templateId: string, versionId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/prompt-templates/${templateId}/versions/${versionId}/activate`, { method: "POST" });
  } catch (error) {
    return { error: describeGenerationActionError(error) };
  }
  revalidatePath(`/app/ai-configuration/prompts/${templateId}`);
  return {};
}

export async function archivePromptTemplateAction(templateId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/prompt-templates/${templateId}/archive`, { method: "POST" });
  } catch (error) {
    return { error: describeGenerationActionError(error) };
  }
  revalidatePath("/app/ai-configuration/prompts");
  revalidatePath(`/app/ai-configuration/prompts/${templateId}`);
  return {};
}

/** Mission Sprint 8A.2 (bugs #1/#4) — vérifie côté backend, pour chaque type de contenu, si un
 *  prompt actif et une politique de routage active existent RÉELLEMENT avant de proposer le
 *  bouton "Générer" : jamais une tentative à l'aveugle suivie d'un échec asynchrone opaque. */
export async function fetchGenerationCapabilities(tenderId: string): Promise<GenerationCapability[]> {
  const result = await appApiFetch<{ items: GenerationCapability[] }>(`/api/v1/tenders/${tenderId}/generation-capabilities`);
  return result.items;
}

export async function launchGenerationAction(tenderId: string, taskType: string): Promise<{ error?: string; generationId?: string }> {
  try {
    const result = await appApiFetch<GenerationSummary>(`/api/v1/tenders/${tenderId}/generations`, {
      method: "POST",
      body: JSON.stringify({ taskType }),
    });
    revalidatePath(`/app/tenders/${tenderId}/generations`);
    return { generationId: result.id };
  } catch (error) {
    return { error: describeGenerationActionError(error) };
  }
}

export async function retryGenerationAction(tenderId: string, generationId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/generations/${generationId}/retry`, { method: "POST" });
  } catch (error) {
    return { error: describeGenerationActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/generations`);
  return {};
}

export async function regenerateGenerationAction(tenderId: string, generationId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/generations/${generationId}/regenerate`, { method: "POST" });
  } catch (error) {
    return { error: describeGenerationActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/generations`);
  return {};
}

export async function cancelGenerationAction(tenderId: string, generationId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/generations/${generationId}/cancel`, { method: "POST" });
  } catch (error) {
    return { error: describeGenerationActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/generations`);
  return {};
}

export async function editGenerationAction(tenderId: string, generationId: string, editedContent: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/generations/${generationId}/edit`, {
      method: "PATCH",
      body: JSON.stringify({ editedContent }),
    });
  } catch (error) {
    return { error: describeGenerationActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/generations`);
  return {};
}

export async function validateGenerationAction(tenderId: string, generationId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/generations/${generationId}/validate`, { method: "POST" });
  } catch (error) {
    return { error: describeGenerationActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/generations`);
  return {};
}

/** Réaudit Codex P1 — "le rejet d'une génération est absent". `reason` optionnelle, jamais
 *  transmise sous forme d'objet arbitraire — toujours une chaîne bornée côté backend (schéma Zod). */
export async function rejectGenerationAction(tenderId: string, generationId: string, reason?: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/generations/${generationId}/reject`, {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    });
  } catch (error) {
    return { error: describeGenerationActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/generations`);
  return {};
}
