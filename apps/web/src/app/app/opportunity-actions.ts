"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { GoNoGoDecision, GoNoGoReport, Opportunity, OpportunityQuickScore, PromoteOpportunityResult } from "../../lib/opportunity-types";
import type { PageResponse } from "../../lib/tenders-types";

export type OpportunityActionState = { error?: string };
export type OpportunityFormActionState = { error?: string };

function describeOpportunityActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Opportunity action failed (${error.status} ${error.code}): ${error.message}`);
    switch (error.status) {
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action.";
      case 404:
        return "Cette opportunité n'existe plus ou n'est plus accessible.";
      case 409:
        if (error.code === "OPPORTUNITY_PROMOTION_REQUIRES_GO_DECISION") return "Une décision GO ou GO conditionnel est requise avant de promouvoir cette opportunité.";
        if (error.code === "OPPORTUNITY_PROMOTION_CONFLICT") return "Cette opportunité n'est plus dans un état permettant la promotion.";
        if (error.code === "TENDER_BUSINESS_ANALYSIS_NOT_FOUND") return "L'analyse IA du DCE doit d'abord réussir avant de générer un rapport GO/NO-GO.";
        if (error.code === "GO_NO_GO_ANALYSIS_NOT_CURRENT") return "Le DCE a changé depuis la dernière analyse : actualisez l'analyse avant de recalculer le GO/NO-GO.";
        return "Cette action entre en conflit avec l'état actuel de la ressource.";
      case 422:
        if (error.code === "GO_NO_GO_DECISION_JUSTIFICATION_REQUIRED") return "Une justification est obligatoire pour une décision NO GO.";
        if (error.code === "GO_NO_GO_DECISION_CONDITIONS_REQUIRED") return "Des conditions sont obligatoires pour une décision GO conditionnel.";
        if (error.code === "OPPORTUNITY_MISSING_CLIENT_ACCOUNT") return "Un client doit être rattaché avant de promouvoir cette opportunité.";
        if (error.code === "GO_NO_GO_ADMIN_BYPASS_JUSTIFICATION_REQUIRED") {
          return "Vous n'êtes pas affecté comme gestionnaire sur ce client : une justification est obligatoire pour agir via votre privilège d'administration.";
        }
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during an Opportunity action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function fetchOpportunity(id: string): Promise<Opportunity> {
  return appApiFetch<Opportunity>(`/api/v1/opportunities/${id}`);
}

export async function fetchOpportunityQuickScore(id: string): Promise<OpportunityQuickScore | null> {
  try {
    return await appApiFetch<OpportunityQuickScore>(`/api/v1/opportunities/${id}/quick-score`);
  } catch (error) {
    if (error instanceof AppApiError && error.status === 404) return null;
    throw error;
  }
}

export async function fetchOpportunityQuickScores(id: string): Promise<OpportunityQuickScore[]> {
  return appApiFetch<OpportunityQuickScore[]>(`/api/v1/opportunities/${id}/quick-scores`);
}

export async function fetchOpportunityDecisions(id: string): Promise<GoNoGoDecision[]> {
  return appApiFetch<GoNoGoDecision[]>(`/api/v1/opportunities/${id}/go-no-go-decisions`);
}

export type CreateOpportunityInput = {
  title: string;
  clientAccountId?: string;
  candidateCompanyId?: string;
  buyerName?: string;
  description?: string;
  sector?: string;
  location?: string;
  submissionDeadline?: string;
  estimatedAmount?: string;
  currency?: string;
  procedureType?: string;
};

function optional(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.trim();
}

/** Motif `createTenderAction` (`app/app/actions.ts`) — `useActionState` + `<form action={...}>`,
 *  redirige vers la fiche créée en cas de succès (jamais un state "success" affiché sur ce même
 *  formulaire). `clientAccountId` reste optionnel (mission §4 — une Opportunity peut exister sans
 *  candidat résolu). */
export async function createOpportunityAction(_prevState: OpportunityFormActionState, formData: FormData): Promise<OpportunityFormActionState> {
  const title = formData.get("title");
  if (typeof title !== "string" || !title.trim()) {
    return { error: "Le titre est obligatoire." };
  }

  const submissionDeadline = optional(formData.get("submissionDeadline"));

  let opportunity: Opportunity;
  try {
    opportunity = await appApiFetch<Opportunity>("/api/v1/opportunities", {
      method: "POST",
      body: JSON.stringify({
        title: title.trim(),
        clientAccountId: optional(formData.get("clientAccountId")),
        candidateCompanyId: optional(formData.get("candidateCompanyId")),
        buyerName: optional(formData.get("buyerName")),
        description: optional(formData.get("description")),
        sector: optional(formData.get("sector")),
        location: optional(formData.get("location")),
        submissionDeadline: submissionDeadline ? new Date(submissionDeadline).toISOString() : undefined,
        estimatedAmount: optional(formData.get("estimatedAmount")),
        currency: optional(formData.get("currency")),
        procedureType: optional(formData.get("procedureType")),
      }),
    });
  } catch (error) {
    return { error: describeOpportunityActionError(error) };
  }

  revalidatePath("/app/opportunities");
  redirect(`/app/opportunities/${opportunity.id}`);
}

export async function updateOpportunityAction(id: string, input: Partial<CreateOpportunityInput>): Promise<OpportunityActionState> {
  try {
    await appApiFetch(`/api/v1/opportunities/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  } catch (error) {
    return { error: describeOpportunityActionError(error) };
  }
  revalidatePath(`/app/opportunities/${id}`);
  return {};
}

export async function changeOpportunityStatusAction(id: string, status: string): Promise<OpportunityActionState> {
  try {
    await appApiFetch(`/api/v1/opportunities/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  } catch (error) {
    return { error: describeOpportunityActionError(error) };
  }
  revalidatePath(`/app/opportunities/${id}`);
  return {};
}

export async function archiveOpportunityAction(id: string): Promise<OpportunityActionState> {
  try {
    await appApiFetch(`/api/v1/opportunities/${id}/archive`, { method: "POST" });
  } catch (error) {
    return { error: describeOpportunityActionError(error) };
  }
  revalidatePath(`/app/opportunities/${id}`);
  return {};
}

export async function restoreOpportunityAction(id: string): Promise<OpportunityActionState> {
  try {
    await appApiFetch(`/api/v1/opportunities/${id}/restore`, { method: "POST" });
  } catch (error) {
    return { error: describeOpportunityActionError(error) };
  }
  revalidatePath(`/app/opportunities/${id}`);
  return {};
}

/** Recalcule TOUJOURS une nouvelle version (mission §29, jamais un écrasement) — le composant
 *  appelant doit rafraîchir la liste des versions après succès. */
export async function computeQuickScoreAction(id: string): Promise<{ score?: OpportunityQuickScore; error?: string }> {
  try {
    const score = await appApiFetch<OpportunityQuickScore>(`/api/v1/opportunities/${id}/quick-score`, { method: "POST" });
    revalidatePath(`/app/opportunities/${id}`);
    return { score };
  } catch (error) {
    return { error: describeOpportunityActionError(error) };
  }
}

export type RecordDecisionInput = {
  decision: "GO" | "GO_CONDITIONAL" | "NO_GO";
  justification?: string | undefined;
  conditions?: string | undefined;
  comment?: string | undefined;
  linkedQuickScoreId?: string | undefined;
};

export async function recordOpportunityDecisionAction(id: string, input: RecordDecisionInput): Promise<OpportunityActionState> {
  try {
    await appApiFetch(`/api/v1/opportunities/${id}/go-no-go-decisions`, { method: "POST", body: JSON.stringify(input) });
  } catch (error) {
    return { error: describeOpportunityActionError(error) };
  }
  revalidatePath(`/app/opportunities/${id}`);
  return {};
}

export async function promoteOpportunityAction(
  id: string,
  input?: { justification?: string | undefined },
): Promise<{ result?: PromoteOpportunityResult; error?: string; requiresAdminBypassJustification?: boolean }> {
  try {
    const result = await appApiFetch<PromoteOpportunityResult>(`/api/v1/opportunities/${id}/promote`, {
      method: "POST",
      body: JSON.stringify({ justification: input?.justification }),
    });
    revalidatePath(`/app/opportunities/${id}`);
    return { result };
  } catch (error) {
    // Audit Codex round 2 — distingué du reste (`error`) pour permettre au bouton d'afficher un
    // champ de justification au lieu d'un simple message d'échec (voir `resolveGoNoGoClientAccess`).
    const requiresAdminBypassJustification = error instanceof AppApiError && error.code === "GO_NO_GO_ADMIN_BYPASS_JUSTIFICATION_REQUIRED";
    return { error: describeOpportunityActionError(error), requiresAdminBypassJustification };
  }
}

// --- GO/NO-GO Niveau 2 (Tender-scoped) ---

export async function fetchGoNoGoReport(tenderId: string): Promise<GoNoGoReport | null> {
  try {
    return await appApiFetch<GoNoGoReport>(`/api/v1/tenders/${tenderId}/go-no-go/report`);
  } catch (error) {
    if (error instanceof AppApiError && (error.status === 404 || error.code === "TENDER_BUSINESS_ANALYSIS_NOT_FOUND")) return null;
    throw error;
  }
}

export async function fetchTenderGoNoGoDecisions(tenderId: string): Promise<GoNoGoDecision[]> {
  return appApiFetch<GoNoGoDecision[]>(`/api/v1/tenders/${tenderId}/go-no-go/decisions`);
}

export async function generateGoNoGoReportAction(tenderId: string): Promise<{ report?: GoNoGoReport; error?: string }> {
  try {
    const report = await appApiFetch<GoNoGoReport>(`/api/v1/tenders/${tenderId}/go-no-go/report`, { method: "POST" });
    revalidatePath(`/app/tenders/${tenderId}`);
    return { report };
  } catch (error) {
    return { error: describeOpportunityActionError(error) };
  }
}

export async function recordTenderGoNoGoDecisionAction(tenderId: string, input: RecordDecisionInput & { linkedReportId?: string | undefined }): Promise<OpportunityActionState> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/go-no-go/decisions`, { method: "POST", body: JSON.stringify(input) });
  } catch (error) {
    return { error: describeOpportunityActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export type { PageResponse };
