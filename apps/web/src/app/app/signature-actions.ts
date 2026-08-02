"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { SignatorySummary, SignatureRequirementSummary, SignatureTransactionSummary } from "../../lib/signature-types";

function describeSignatureActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Signature action failed (${error.status} ${error.code}): ${error.message}`);
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
        if (error.code === "SIGNATORY_NOT_VERIFIED") return "Le pouvoir de ce signataire n'a pas encore été vérifié.";
        if (error.code === "EXPORT_NOT_ELIGIBLE_FOR_SIGNATURE") return "Ce document n'est pas éligible à la signature (export final requis).";
        return "Certains champs sont invalides.";
      case 503:
        return "Le prestataire de signature n'est pas configuré ou est mal configuré — contactez un administrateur.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a signature action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

export async function detectSignatureRequirementAction(
  tenderId: string,
  input: { documentRef: string; mandatory: boolean; sourceDce?: string; pageOrSection?: string; momentText?: string },
): Promise<{ error?: string; requirement?: SignatureRequirementSummary }> {
  try {
    const requirement = await appApiFetch<SignatureRequirementSummary>(`/api/v1/tenders/${tenderId}/signature-requirements`, { method: "POST", body: JSON.stringify(input) });
    revalidatePath(`/app/tenders/${tenderId}/signature`);
    return { requirement };
  } catch (error) {
    return { error: describeSignatureActionError(error) };
  }
}

export async function confirmSignatureRequirementAction(tenderId: string, requirementId: string, comment?: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/signature-requirements/${requirementId}/confirm`, { method: "POST", body: JSON.stringify({ ...(comment ? { comment } : {}) }) });
  } catch (error) {
    return { error: describeSignatureActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/signature`);
  return {};
}

export async function rejectSignatureRequirementAction(tenderId: string, requirementId: string, comment?: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/signature-requirements/${requirementId}/reject`, { method: "POST", body: JSON.stringify({ ...(comment ? { comment } : {}) }) });
  } catch (error) {
    return { error: describeSignatureActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/signature`);
  return {};
}

export async function registerSignatoryAction(
  tenderId: string,
  input: { firstName: string; lastName: string; professionalEmail: string; jobTitle?: string; organizationName?: string },
): Promise<{ error?: string; signatory?: SignatorySummary }> {
  try {
    const signatory = await appApiFetch<SignatorySummary>(`/api/v1/tenders/${tenderId}/signatories`, { method: "POST", body: JSON.stringify(input) });
    revalidatePath(`/app/tenders/${tenderId}/signature`);
    return { signatory };
  } catch (error) {
    return { error: describeSignatureActionError(error) };
  }
}

export async function verifySignatoryAction(tenderId: string, signatoryId: string, approved: boolean): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/signatories/${signatoryId}/verify`, { method: "POST", body: JSON.stringify({ approved }) });
  } catch (error) {
    return { error: describeSignatureActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/signature`);
  return {};
}

export async function prepareSignatureTransactionAction(
  tenderId: string,
  exportJobId: string,
  signatoryIds: string[],
  requestedLevel?: string,
): Promise<{ error?: string; transaction?: SignatureTransactionSummary }> {
  try {
    const transaction = await appApiFetch<SignatureTransactionSummary>(`/api/v1/exports/${exportJobId}/signature-transactions`, {
      method: "POST",
      body: JSON.stringify({ signatoryIds, ...(requestedLevel ? { requestedLevel } : {}) }),
    });
    revalidatePath(`/app/tenders/${tenderId}/signature`);
    return { transaction };
  } catch (error) {
    return { error: describeSignatureActionError(error) };
  }
}

export async function startSignatureTransactionAction(tenderId: string, transactionId: string, returnUrl: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/signature-transactions/${transactionId}/start`, { method: "POST", body: JSON.stringify({ returnUrl }) });
  } catch (error) {
    return { error: describeSignatureActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/signature`);
  return {};
}

/** Mission Sprint 8A bis §37/§46 — "simulation locale de signature" en mode FAKE : interroge le
 *  prestataire et applique la transition locale correspondante (aucun webhook réel en mode FAKE). */
export async function syncSignatureTransactionAction(tenderId: string, transactionId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/signature-transactions/${transactionId}/sync`, { method: "POST" });
  } catch (error) {
    return { error: describeSignatureActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/signature`);
  return {};
}

export async function retrieveSignedArtifactsAction(tenderId: string, transactionId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/signature-transactions/${transactionId}/retrieve-artifacts`, { method: "POST" });
  } catch (error) {
    return { error: describeSignatureActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/signature`);
  return {};
}

/** Mission §46/§51 — la SEULE voie légitime vers VERIFIED : recalcule le hash du document RÉELLEMENT
 *  stocké et le compare à celui enregistré, jamais une simple confiance dans le statut du prestataire. */
export async function verifySignedDocumentIntegrityAction(tenderId: string, transactionId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/signature-transactions/${transactionId}/verify`, { method: "POST" });
  } catch (error) {
    return { error: describeSignatureActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/signature`);
  return {};
}

export async function importSignedDocumentAction(tenderId: string, transactionId: string, formData: FormData): Promise<{ error?: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Un fichier PDF est requis." };
  }
  const body = new FormData();
  body.set("file", file);
  try {
    await appApiFetch(`/api/v1/signature-transactions/${transactionId}/signed-artifacts`, { method: "POST", body });
  } catch (error) {
    return { error: describeSignatureActionError(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}/signature`);
  return {};
}
