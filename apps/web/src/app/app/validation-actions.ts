"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { FinalApprovalSummary, ValidationRunSummary } from "../../lib/validation-types";

function describeValidationActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Validation action failed (${error.status} ${error.code}): ${error.message}`);
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
        if (error.code === "APPROVAL_ALREADY_INVALIDATED") return "Cette approbation a déjà été invalidée.";
        if (error.code === "MANIFEST_MISMATCH") return "Le contenu a changé depuis l'approbation — celle-ci a été invalidée.";
        return "Cette action entre en conflit avec l'état actuel de la ressource.";
      case 422:
        if (error.code === "BLOCKING_ISSUES_OPEN") return "Des contrôles bloquants sont encore ouverts — résolvez-les avant d'approuver.";
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a validation action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function runFinalValidationAction(tenderId: string, exportJobId: string): Promise<{ error?: string; run?: ValidationRunSummary }> {
  try {
    const run = await appApiFetch<ValidationRunSummary>(`/api/v1/tenders/${tenderId}/validation/run`, { method: "POST", body: JSON.stringify({ exportJobId }) });
    revalidatePath(`/app/tenders/${tenderId}/validation`);
    return { run };
  } catch (error) {
    return { error: describeValidationActionError(error) };
  }
}

export async function resolveValidationIssueAction(tenderId: string, issueId: string, resolutionNote: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/validation/issues/${issueId}/resolve`, { method: "POST", body: JSON.stringify({ resolutionNote }) });
  } catch (error) {
    return { error: describeValidationActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/validation`);
  return {};
}

export async function reopenValidationIssueAction(tenderId: string, issueId: string, resolutionNote: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/validation/issues/${issueId}/reopen`, { method: "POST", body: JSON.stringify({ resolutionNote }) });
  } catch (error) {
    return { error: describeValidationActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/validation`);
  return {};
}

export async function approveFinalVersionAction(tenderId: string, validationRunId: string, comment: string | undefined): Promise<{ error?: string; approval?: FinalApprovalSummary }> {
  try {
    const approval = await appApiFetch<FinalApprovalSummary>(`/api/v1/tenders/${tenderId}/final-approval`, {
      method: "POST",
      body: JSON.stringify({ validationRunId, ...(comment ? { comment } : {}) }),
    });
    revalidatePath(`/app/tenders/${tenderId}/validation`);
    return { approval };
  } catch (error) {
    return { error: describeValidationActionError(error) };
  }
}

export async function reopenFinalVersionAction(tenderId: string, reason: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/reopen`, { method: "POST", body: JSON.stringify({ reason }) });
  } catch (error) {
    return { error: describeValidationActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/validation`);
  return {};
}
