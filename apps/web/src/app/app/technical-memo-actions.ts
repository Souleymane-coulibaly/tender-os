"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type {
  TechnicalMemo,
  TechnicalMemoCoverage,
  TechnicalMemoFreshnessResult,
  TechnicalMemoSection,
  TechnicalMemoSectionRequirement,
  TechnicalMemoSectionRevision,
  TechnicalMemoTemplateOrigin,
} from "../../lib/technical-memo-types";
import type { GeneratedDocumentRevisionSummary } from "../../lib/document-generation-types";
import { apiErrorMessage } from "../../lib/api-error-messages";

export type TechnicalMemoActionState = { error?: string };

/** Ne laisse jamais un message backend brut atteindre un composant — même motif que
 *  `describeChatActionError`/`describeDocumentActionError`. */
function describeTechnicalMemoActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Technical memo action failed (${error.status} ${error.code}): ${error.message}`);
    const known = apiErrorMessage(error);
    if (known) return known;
    switch (error.status) {
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action sur le mémoire technique.";
      case 404:
        return "Introuvable ou accès refusé.";
      case 409:
        return "Cette action entre en conflit avec l'état actuel de la ressource.";
      case 413:
        return "Le fichier est trop volumineux.";
      case 415:
        return "Ce type de fichier n'est pas pris en charge — un fichier .docx est attendu.";
      case 422:
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a technical memo action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function fetchTechnicalMemos(tenderId: string): Promise<TechnicalMemo[]> {
  return appApiFetch<TechnicalMemo[]>(`/api/v1/tenders/${tenderId}/technical-memos`);
}

export async function fetchTechnicalMemo(technicalMemoId: string): Promise<{ memo: TechnicalMemo; sections: TechnicalMemoSection[] }> {
  return appApiFetch<{ memo: TechnicalMemo; sections: TechnicalMemoSection[] }>(`/api/v1/technical-memos/${technicalMemoId}`);
}

export async function fetchTechnicalMemoFreshness(technicalMemoId: string): Promise<TechnicalMemoFreshnessResult | null> {
  try {
    return await appApiFetch<TechnicalMemoFreshnessResult>(`/api/v1/technical-memos/${technicalMemoId}/freshness`);
  } catch {
    // Checkpoint 2.1-P2.1-FIX-D — lecture seule, jamais bloquant : dégradé à `null` (bandeau
    // simplement absent) sur toute erreur inattendue, jamais une page cassée pour un simple signal.
    return null;
  }
}

export async function createTechnicalMemoAction(
  tenderId: string,
  input: { templateOrigin: TechnicalMemoTemplateOrigin; lotId?: string | undefined; file?: File | undefined },
): Promise<TechnicalMemoActionState & { memo?: TechnicalMemo; sections?: TechnicalMemoSection[] }> {
  try {
    const body = new FormData();
    body.set("templateOrigin", input.templateOrigin);
    if (input.lotId) body.set("lotId", input.lotId);
    if (input.file && input.file.size > 0) body.set("file", input.file);

    const result = await appApiFetch<{ memo: TechnicalMemo; sections: TechnicalMemoSection[] }>(`/api/v1/tenders/${tenderId}/technical-memos`, { method: "POST", body });
    revalidatePath(`/app/tenders/${tenderId}/technical-memo`);
    return result;
  } catch (error) {
    return { error: describeTechnicalMemoActionError(error) };
  }
}

export async function prepareTechnicalMemoTemplateAction(
  tenderId: string,
  technicalMemoId: string,
): Promise<TechnicalMemoActionState & { memo?: TechnicalMemo; sections?: TechnicalMemoSection[] }> {
  try {
    const result = await appApiFetch<{ memo: TechnicalMemo; sections: TechnicalMemoSection[] }>(`/api/v1/technical-memos/${technicalMemoId}/prepare`, { method: "POST" });
    revalidatePath(`/app/tenders/${tenderId}/technical-memo`);
    return result;
  } catch (error) {
    return { error: describeTechnicalMemoActionError(error) };
  }
}

export async function mapTechnicalMemoSectionsAction(technicalMemoId: string): Promise<TechnicalMemoActionState & { links?: TechnicalMemoSectionRequirement[] }> {
  try {
    const links = await appApiFetch<TechnicalMemoSectionRequirement[]>(`/api/v1/technical-memos/${technicalMemoId}/map`, { method: "POST" });
    return { links };
  } catch (error) {
    return { error: describeTechnicalMemoActionError(error) };
  }
}

export async function generateTechnicalMemoSectionAction(
  technicalMemoId: string,
  sectionId: string,
  userInstruction?: string,
): Promise<TechnicalMemoActionState & { revision?: TechnicalMemoSectionRevision }> {
  try {
    const revision = await appApiFetch<TechnicalMemoSectionRevision>(`/api/v1/technical-memos/${technicalMemoId}/sections/${sectionId}/generate`, {
      method: "POST",
      body: JSON.stringify(userInstruction ? { userInstruction } : {}),
    });
    return { revision };
  } catch (error) {
    return { error: describeTechnicalMemoActionError(error) };
  }
}

export async function editTechnicalMemoSectionAction(
  technicalMemoId: string,
  sectionId: string,
  content: string,
): Promise<TechnicalMemoActionState & { revision?: TechnicalMemoSectionRevision }> {
  try {
    const revision = await appApiFetch<TechnicalMemoSectionRevision>(`/api/v1/technical-memos/${technicalMemoId}/sections/${sectionId}/edit`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    return { revision };
  } catch (error) {
    return { error: describeTechnicalMemoActionError(error) };
  }
}

export async function validateTechnicalMemoSectionAction(technicalMemoId: string, sectionId: string): Promise<TechnicalMemoActionState & { section?: TechnicalMemoSection }> {
  try {
    const section = await appApiFetch<TechnicalMemoSection>(`/api/v1/technical-memos/${technicalMemoId}/sections/${sectionId}/validate`, { method: "POST" });
    return { section };
  } catch (error) {
    return { error: describeTechnicalMemoActionError(error) };
  }
}

export async function fetchTechnicalMemoCoverage(technicalMemoId: string): Promise<TechnicalMemoCoverage> {
  return appApiFetch<TechnicalMemoCoverage>(`/api/v1/technical-memos/${technicalMemoId}/coverage`);
}

export async function confirmRequirementCoverageAction(
  technicalMemoId: string,
  requirementLinkId: string,
  input: { coverageStatus: TechnicalMemoSectionRequirement["coverageStatus"]; coverageReason?: string },
): Promise<TechnicalMemoActionState & { link?: TechnicalMemoSectionRequirement }> {
  try {
    const link = await appApiFetch<TechnicalMemoSectionRequirement>(`/api/v1/technical-memos/${technicalMemoId}/requirements/${requirementLinkId}/confirm-coverage`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return { link };
  } catch (error) {
    return { error: describeTechnicalMemoActionError(error) };
  }
}

export async function exportTechnicalMemoAction(technicalMemoId: string): Promise<TechnicalMemoActionState & { revision?: GeneratedDocumentRevisionSummary }> {
  try {
    const revision = await appApiFetch<GeneratedDocumentRevisionSummary>(`/api/v1/technical-memos/${technicalMemoId}/export`, { method: "POST" });
    return { revision };
  } catch (error) {
    return { error: describeTechnicalMemoActionError(error) };
  }
}
