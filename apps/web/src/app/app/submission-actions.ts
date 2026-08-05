"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { TenderSubmissionCapabilities, TenderSubmissionReadinessResult, TenderSubmissionSummary } from "../../lib/submission-types";

export type FormActionState = { error?: string };

function describeSubmissionActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Submission action failed (${error.status} ${error.code}): ${error.message}`);
    switch (error.status) {
      case 400:
        return "Certains champs sont invalides.";
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas l'autorisation nécessaire pour cette action.";
      case 404:
        return "Ressource introuvable.";
      case 409:
        if (error.code === "ACTIVE_TENDER_SUBMISSION_ALREADY_EXISTS") return "Une soumission est déjà en cours pour ce marché — remplacez-la explicitement avant d'en enregistrer une nouvelle.";
        if (error.code === "TENDER_SUBMISSION_ALREADY_REPLACED") return "Cette soumission a déjà été remplacée.";
        if (error.code === "INVALID_TENDER_SUBMISSION_STATUS_TRANSITION") return "Cette transition de statut n'est plus possible dans l'état actuel — rechargez la page.";
        return "Cette action entre en conflit avec l'état actuel de la ressource.";
      case 422:
        if (error.code === "SUBMISSION_PACKAGE_MISSING") return "Le package final est introuvable.";
        if (error.code === "SUBMISSION_PACKAGE_OUTDATED") return "Ce package n'est plus à jour. Générez une nouvelle version avant d'enregistrer le dépôt.";
        if (error.code === "SUBMISSION_PACKAGE_VERSION_MISMATCH") return "Cette version du package ne correspond pas au dossier.";
        if (error.code === "SUBMISSION_DEADLINE_PASSED") return "La date limite de dépôt est dépassée.";
        if (error.code === "TENDER_NOT_READY_FOR_SUBMISSION") return "Le dossier n'est pas prêt pour le dépôt.";
        if (error.code === "RECEIPT_CONFIRMATION_REQUIRES_EVIDENCE") return "Ajoutez une référence de reçu ou une preuve avant de confirmer, ou confirmez explicitement sans preuve.";
        if (error.code === "DOCUMENT_NOT_USABLE_FOR_SUBMISSION_PROOF") return "Ce document ne peut pas être utilisé comme preuve (introuvable ou sans version exploitable).";
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a submission action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

function revalidateSubmission(tenderId: string): void {
  revalidatePath(`/app/tenders/${tenderId}/submission`);
  revalidatePath(`/app/tenders/${tenderId}`);
}

export async function getTenderSubmissionReadinessAction(tenderId: string): Promise<{ error?: string; readiness?: TenderSubmissionReadinessResult }> {
  try {
    const readiness = await appApiFetch<TenderSubmissionReadinessResult>(`/api/v1/tenders/${tenderId}/submission-readiness`);
    return { readiness };
  } catch (error) {
    return { error: describeSubmissionActionError(error) };
  }
}

export async function getTenderSubmissionCapabilitiesAction(tenderId: string): Promise<{ error?: string; capabilities?: TenderSubmissionCapabilities }> {
  try {
    const capabilities = await appApiFetch<TenderSubmissionCapabilities>(`/api/v1/tenders/${tenderId}/submission-capabilities`);
    return { capabilities };
  } catch (error) {
    return { error: describeSubmissionActionError(error) };
  }
}

export async function listTenderSubmissionsAction(tenderId: string): Promise<{ error?: string; submissions?: TenderSubmissionSummary[] }> {
  try {
    const submissions = await appApiFetch<TenderSubmissionSummary[]>(`/api/v1/tenders/${tenderId}/submissions`);
    return { submissions };
  } catch (error) {
    return { error: describeSubmissionActionError(error) };
  }
}

export async function recordTenderSubmissionAction(
  tenderId: string,
  input: { packageId: string; platform: string; customPlatformName?: string | undefined; submittedAt: string; platformReference?: string | undefined; receiptReference?: string | undefined; notes?: string | undefined },
): Promise<{ error?: string; submission?: TenderSubmissionSummary }> {
  try {
    const submission = await appApiFetch<TenderSubmissionSummary>(`/api/v1/tenders/${tenderId}/submissions`, { method: "POST", body: JSON.stringify(input) });
    revalidateSubmission(tenderId);
    return { submission };
  } catch (error) {
    return { error: describeSubmissionActionError(error) };
  }
}

export async function startTenderSubmissionAction(
  tenderId: string,
  input: { packageId: string; platform: string; customPlatformName?: string | undefined },
): Promise<{ error?: string; submission?: TenderSubmissionSummary }> {
  try {
    const submission = await appApiFetch<TenderSubmissionSummary>(`/api/v1/tenders/${tenderId}/submissions/start`, { method: "POST", body: JSON.stringify(input) });
    revalidateSubmission(tenderId);
    return { submission };
  } catch (error) {
    return { error: describeSubmissionActionError(error) };
  }
}

export async function addSubmissionProofAction(tenderId: string, submissionId: string, input: { documentId: string; proofType: string }): Promise<{ error?: string; submission?: TenderSubmissionSummary }> {
  try {
    const submission = await appApiFetch<TenderSubmissionSummary>(`/api/v1/submissions/${submissionId}/proofs`, { method: "POST", body: JSON.stringify(input) });
    revalidateSubmission(tenderId);
    return { submission };
  } catch (error) {
    return { error: describeSubmissionActionError(error) };
  }
}

/** Mission §12 — dépose le fichier de preuve comme un `Document` réel (module Documents, jamais un
 *  second stockage), puis le lie à la soumission en une seule action côté formulaire. */
export async function uploadSubmissionProofAction(tenderId: string, submissionId: string, proofType: string, formData: FormData): Promise<{ error?: string; submission?: TenderSubmissionSummary }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Sélectionnez un fichier de preuve avant de l'ajouter." };
  }
  try {
    const uploadForm = new FormData();
    uploadForm.append("title", `Preuve de dépôt — ${file.name}`);
    uploadForm.append("origin", "USER_UPLOAD");
    uploadForm.append("domain", "TENDER");
    uploadForm.append("category", "SUBMISSION_PROOF");
    uploadForm.append("file", file);
    const document = await appApiFetch<{ id: string }>("/api/v1/documents", { method: "POST", body: uploadForm });

    const submission = await appApiFetch<TenderSubmissionSummary>(`/api/v1/submissions/${submissionId}/proofs`, { method: "POST", body: JSON.stringify({ documentId: document.id, proofType }) });
    revalidateSubmission(tenderId);
    return { submission };
  } catch (error) {
    return { error: describeSubmissionActionError(error) };
  }
}

export async function confirmSubmissionReceiptAction(
  tenderId: string,
  submissionId: string,
  input: { receiptReference?: string | undefined; confirmedWithoutEvidence?: boolean },
): Promise<{ error?: string; submission?: TenderSubmissionSummary }> {
  try {
    const submission = await appApiFetch<TenderSubmissionSummary>(`/api/v1/submissions/${submissionId}/confirm-receipt`, { method: "POST", body: JSON.stringify(input) });
    revalidateSubmission(tenderId);
    return { submission };
  } catch (error) {
    return { error: describeSubmissionActionError(error) };
  }
}

export async function replaceTenderSubmissionAction(
  tenderId: string,
  submissionId: string,
  input: { packageId: string; platform: string; customPlatformName?: string | undefined; submittedAt: string; platformReference?: string | undefined; receiptReference?: string | undefined; notes?: string | undefined },
): Promise<{ error?: string; submission?: TenderSubmissionSummary }> {
  try {
    const submission = await appApiFetch<TenderSubmissionSummary>(`/api/v1/submissions/${submissionId}/replace`, { method: "POST", body: JSON.stringify(input) });
    revalidateSubmission(tenderId);
    return { submission };
  } catch (error) {
    return { error: describeSubmissionActionError(error) };
  }
}

export async function withdrawTenderSubmissionAction(tenderId: string, submissionId: string, input: { withdrawalReason?: string | undefined }): Promise<{ error?: string; submission?: TenderSubmissionSummary }> {
  try {
    const submission = await appApiFetch<TenderSubmissionSummary>(`/api/v1/submissions/${submissionId}/withdraw`, { method: "POST", body: JSON.stringify(input) });
    revalidateSubmission(tenderId);
    return { submission };
  } catch (error) {
    return { error: describeSubmissionActionError(error) };
  }
}

export async function cancelTenderSubmissionAction(tenderId: string, submissionId: string, input: { cancellationReason?: string | undefined }): Promise<{ error?: string; submission?: TenderSubmissionSummary }> {
  try {
    const submission = await appApiFetch<TenderSubmissionSummary>(`/api/v1/submissions/${submissionId}/cancel`, { method: "POST", body: JSON.stringify(input) });
    revalidateSubmission(tenderId);
    return { submission };
  } catch (error) {
    return { error: describeSubmissionActionError(error) };
  }
}

export async function recordSubmissionRejectionAction(
  tenderId: string,
  submissionId: string,
  input: { rejectionCategory: string; rejectionDescription: string },
): Promise<{ error?: string; submission?: TenderSubmissionSummary }> {
  try {
    const submission = await appApiFetch<TenderSubmissionSummary>(`/api/v1/submissions/${submissionId}/reject`, { method: "POST", body: JSON.stringify(input) });
    revalidateSubmission(tenderId);
    return { submission };
  } catch (error) {
    return { error: describeSubmissionActionError(error) };
  }
}
