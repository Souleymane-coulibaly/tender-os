"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type { SubcontractorProfile } from "../../lib/subcontractor-types";
import { apiErrorMessage } from "../../lib/api-error-messages";

export type FormActionState = { error?: string };

function describeSubcontractorActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Subcontractor action failed (${error.status} ${error.code}): ${error.message}`);
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
        return "Ce sous-traitant est introuvable.";
      case 409:
        return "Cette action entre en conflit avec l'état actuel de ce sous-traitant.";
      case 422:
        return "Certains champs sont invalides.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error("[TenderOS] Unexpected error during a subcontractor action:", error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

function optional(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function createSubcontractorProfileAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const legalName = formData.get("legalName");
  if (typeof legalName !== "string" || !legalName.trim()) {
    return { error: "La raison sociale est obligatoire." };
  }

  let profile: SubcontractorProfile;
  try {
    profile = await appApiFetch<SubcontractorProfile>("/api/v1/subcontractor-profiles", {
      method: "POST",
      body: JSON.stringify({
        legalName: legalName.trim(),
        tradeName: optional(formData.get("tradeName")),
        siren: optional(formData.get("siren")),
        siret: optional(formData.get("siret")),
        legalForm: optional(formData.get("legalForm")),
        addressLine: optional(formData.get("addressLine")),
        postalCode: optional(formData.get("postalCode")),
        city: optional(formData.get("city")),
        country: optional(formData.get("country")),
        legalRepresentativeName: optional(formData.get("legalRepresentativeName")),
        contactEmail: optional(formData.get("contactEmail")),
        contactPhone: optional(formData.get("contactPhone")),
        skills: optional(formData.get("skills")),
        domains: optional(formData.get("domains")),
      }),
    });
  } catch (error) {
    return { error: describeSubcontractorActionError(error) };
  }

  revalidatePath("/app/subcontractor-profiles");
  redirect(`/app/subcontractor-profiles/${profile.id}`);
}

export async function updateSubcontractorProfileAction(subcontractorId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const legalName = formData.get("legalName");
  if (typeof legalName !== "string" || !legalName.trim()) {
    return { error: "La raison sociale est obligatoire." };
  }

  try {
    await appApiFetch(`/api/v1/subcontractor-profiles/${subcontractorId}`, {
      method: "PATCH",
      body: JSON.stringify({
        legalName: legalName.trim(),
        tradeName: optional(formData.get("tradeName")),
        siren: optional(formData.get("siren")),
        siret: optional(formData.get("siret")),
        legalForm: optional(formData.get("legalForm")),
        addressLine: optional(formData.get("addressLine")),
        postalCode: optional(formData.get("postalCode")),
        city: optional(formData.get("city")),
        country: optional(formData.get("country")),
        legalRepresentativeName: optional(formData.get("legalRepresentativeName")),
        contactEmail: optional(formData.get("contactEmail")),
        contactPhone: optional(formData.get("contactPhone")),
        skills: optional(formData.get("skills")),
        domains: optional(formData.get("domains")),
        bankAccountHolder: optional(formData.get("bankAccountHolder")),
        iban: optional(formData.get("iban")),
        bic: optional(formData.get("bic")),
      }),
    });
  } catch (error) {
    return { error: describeSubcontractorActionError(error) };
  }

  revalidatePath(`/app/subcontractor-profiles/${subcontractorId}`);
  return {};
}

export async function archiveSubcontractorProfileAction(subcontractorId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/subcontractor-profiles/${subcontractorId}/archive`, { method: "POST" });
  } catch (error) {
    return { error: describeSubcontractorActionError(error) };
  }
  revalidatePath(`/app/subcontractor-profiles/${subcontractorId}`);
  revalidatePath("/app/subcontractor-profiles");
  return {};
}

export async function restoreSubcontractorProfileAction(subcontractorId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/subcontractor-profiles/${subcontractorId}/restore`, { method: "POST" });
  } catch (error) {
    return { error: describeSubcontractorActionError(error) };
  }
  revalidatePath(`/app/subcontractor-profiles/${subcontractorId}`);
  revalidatePath("/app/subcontractor-profiles");
  return {};
}

export async function createSubcontractorReferenceAction(subcontractorId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const projectName = formData.get("projectName");
  if (typeof projectName !== "string" || !projectName.trim()) {
    return { error: "Le nom du projet est obligatoire." };
  }
  try {
    await appApiFetch(`/api/v1/subcontractor-profiles/${subcontractorId}/references`, {
      method: "POST",
      body: JSON.stringify({ projectName: projectName.trim(), clientName: optional(formData.get("clientName")), description: optional(formData.get("description")) }),
    });
  } catch (error) {
    return { error: describeSubcontractorActionError(error) };
  }
  revalidatePath(`/app/subcontractor-profiles/${subcontractorId}`);
  return {};
}

export async function archiveSubcontractorReferenceAction(subcontractorId: string, referenceId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/subcontractor-profiles/${subcontractorId}/references/${referenceId}`, { method: "DELETE" });
  } catch (error) {
    return { error: describeSubcontractorActionError(error) };
  }
  revalidatePath(`/app/subcontractor-profiles/${subcontractorId}`);
  return {};
}

export async function createSubcontractorCertificationAction(subcontractorId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    return { error: "Le nom de la certification est obligatoire." };
  }
  try {
    await appApiFetch(`/api/v1/subcontractor-profiles/${subcontractorId}/certifications`, {
      method: "POST",
      body: JSON.stringify({ name: name.trim(), issuer: optional(formData.get("issuer")), expiresAt: optional(formData.get("expiresAt")) }),
    });
  } catch (error) {
    return { error: describeSubcontractorActionError(error) };
  }
  revalidatePath(`/app/subcontractor-profiles/${subcontractorId}`);
  return {};
}

export async function archiveSubcontractorCertificationAction(subcontractorId: string, certificationId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/subcontractor-profiles/${subcontractorId}/certifications/${certificationId}`, { method: "DELETE" });
  } catch (error) {
    return { error: describeSubcontractorActionError(error) };
  }
  revalidatePath(`/app/subcontractor-profiles/${subcontractorId}`);
  return {};
}

export async function createSubcontractorInsuranceAction(subcontractorId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const type = formData.get("type");
  if (typeof type !== "string" || !type.trim()) {
    return { error: "Le type d'assurance est obligatoire." };
  }
  try {
    await appApiFetch(`/api/v1/subcontractor-profiles/${subcontractorId}/insurances`, {
      method: "POST",
      body: JSON.stringify({ type: type.trim(), insurer: optional(formData.get("insurer")), expiresAt: optional(formData.get("expiresAt")) }),
    });
  } catch (error) {
    return { error: describeSubcontractorActionError(error) };
  }
  revalidatePath(`/app/subcontractor-profiles/${subcontractorId}`);
  return {};
}

export async function archiveSubcontractorInsuranceAction(subcontractorId: string, insuranceId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/subcontractor-profiles/${subcontractorId}/insurances/${insuranceId}`, { method: "DELETE" });
  } catch (error) {
    return { error: describeSubcontractorActionError(error) };
  }
  revalidatePath(`/app/subcontractor-profiles/${subcontractorId}`);
  return {};
}

export async function attachSubcontractorDocumentAction(subcontractorId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const documentId = formData.get("documentId");
  const category = formData.get("category");
  if (typeof documentId !== "string" || !documentId.trim() || typeof category !== "string" || !category.trim()) {
    return { error: "Le document et la catégorie sont obligatoires." };
  }
  try {
    await appApiFetch(`/api/v1/subcontractor-profiles/${subcontractorId}/documents`, {
      method: "POST",
      body: JSON.stringify({ documentId: documentId.trim(), category }),
    });
  } catch (error) {
    return { error: describeSubcontractorActionError(error) };
  }
  revalidatePath(`/app/subcontractor-profiles/${subcontractorId}`);
  return {};
}
