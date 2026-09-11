"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import { apiErrorMessage } from "../../lib/api-error-messages";

/**
 * Checkpoint TENDEROS-2.1-CCV2-I.4 — 7 actions d'ECRITURE de candidature ont ete retirees ici
 * (identite juridique, comptes bancaires, assurances, certifications, references, moyens humains et
 * materiels). Leurs routes API n'existent plus : les conserver aurait laisse du code appelant une
 * adresse morte, que TypeScript accepte sans broncher.
 *
 * Ce qui reste est exclusivement COMMERCIAL ou transitionnel : contacts CRM, documents commerciaux,
 * et l'archivage bancaire — seul moyen de neutraliser une ligne Legacy (CCV2-I.2 §8).
 */

export type FormActionState = { error?: string };

/** Mêmes conventions que `client-portfolio-actions.ts` : messages français par statut HTTP, jamais
 *  un détail technique brut exposé côté utilisateur. */
function describeCompanyProfileActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Company profile action failed (${error.status} ${error.code}): ${error.message}`);
    const known = apiErrorMessage(error);
    if (known) return known;
    switch (error.status) {
      case 400:
        return "Certains champs sont invalides.";
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action.";
      case 404:
        return "Cette ressource est introuvable ou vous n'y avez pas accès.";
      case 409:
        return "Cette action entre en conflit avec l'état actuel de cette ressource.";
      case 422:
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a company profile action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

function optional(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}


export async function createRepresentativeAction(clientId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const firstName = formData.get("firstName");
  const lastName = formData.get("lastName");
  const type = formData.get("type");
  if (typeof firstName !== "string" || !firstName.trim() || typeof lastName !== "string" || !lastName.trim() || typeof type !== "string" || !type.trim()) {
    return { error: "Prénom, nom et type sont obligatoires." };
  }
  try {
    await appApiFetch(`/api/v1/clients/${clientId}/representatives`, {
      method: "POST",
      body: JSON.stringify({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        type,
        jobTitle: optional(formData.get("jobTitle")),
        email: optional(formData.get("email")),
        phone: optional(formData.get("phone")),
        signatureScope: optional(formData.get("signatureScope")),
      }),
    });
  } catch (error) {
    return { error: describeCompanyProfileActionError(error) };
  }
  revalidatePath(`/app/clients/${clientId}/company-profile`);
  return {};
}


export async function archiveBankAccountAction(clientId: string, bankAccountId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/clients/${clientId}/bank-accounts/${bankAccountId}/archive`, { method: "POST" });
  } catch (error) {
    return { error: describeCompanyProfileActionError(error) };
  }
  revalidatePath(`/app/clients/${clientId}/company-profile`);
  return {};
}






export async function attachClientDocumentAction(clientId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const documentId = formData.get("documentId");
  const category = formData.get("category");
  if (typeof documentId !== "string" || !documentId.trim() || typeof category !== "string" || !category.trim()) {
    return { error: "Le document et la catégorie sont obligatoires." };
  }
  try {
    await appApiFetch(`/api/v1/clients/${clientId}/documents`, {
      method: "POST",
      body: JSON.stringify({ documentId: documentId.trim(), category }),
    });
  } catch (error) {
    return { error: describeCompanyProfileActionError(error) };
  }
  revalidatePath(`/app/clients/${clientId}/company-profile`);
  return {};
}
