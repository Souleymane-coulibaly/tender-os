"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";

export type FormActionState = { error?: string };

/** Mêmes conventions que `client-portfolio-actions.ts` : messages français par statut HTTP, jamais
 *  un détail technique brut exposé côté utilisateur. */
function describeCompanyProfileActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Company profile action failed (${error.status} ${error.code}): ${error.message}`);
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
        if (error.code === "DUPLICATE_SIRET_IN_ORGANIZATION") return "Un autre client de votre organisation utilise déjà ce SIRET.";
        return "Cette action entre en conflit avec l'état actuel de cette ressource.";
      case 422:
        if (error.code === "INVALID_COMPANY_IDENTIFIER_FORMAT") return "Le format du SIREN/SIRET/TVA saisi est invalide.";
        if (error.code === "DOCUMENT_NOT_USABLE_FOR_COMPANY_PROFILE") return "Ce document n'a pas encore de version exploitable.";
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

export async function upsertLegalIdentityAction(clientId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  try {
    await appApiFetch(`/api/v1/clients/${clientId}/legal-identity`, {
      method: "PATCH",
      body: JSON.stringify({
        legalName: optional(formData.get("legalName")),
        tradeName: optional(formData.get("tradeName")),
        siren: optional(formData.get("siren")),
        siretPrincipal: optional(formData.get("siretPrincipal")),
        vatNumber: optional(formData.get("vatNumber")),
        legalForm: optional(formData.get("legalForm")),
        apeCode: optional(formData.get("apeCode")),
        addressLine: optional(formData.get("addressLine")),
        postalCode: optional(formData.get("postalCode")),
        city: optional(formData.get("city")),
        country: optional(formData.get("country")),
        phone: optional(formData.get("phone")),
        generalEmail: optional(formData.get("generalEmail")),
        website: optional(formData.get("website")),
        confirmDuplicate: formData.get("confirmDuplicate") === "true",
      }),
    });
  } catch (error) {
    return { error: describeCompanyProfileActionError(error) };
  }
  revalidatePath(`/app/clients/${clientId}/company-profile`);
  return {};
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

export async function createBankAccountAction(clientId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const accountHolder = formData.get("accountHolder");
  const iban = formData.get("iban");
  if (typeof accountHolder !== "string" || !accountHolder.trim() || typeof iban !== "string" || !iban.trim()) {
    return { error: "Titulaire et IBAN sont obligatoires." };
  }
  try {
    await appApiFetch(`/api/v1/clients/${clientId}/bank-accounts`, {
      method: "POST",
      body: JSON.stringify({ accountHolder: accountHolder.trim(), iban: iban.trim(), bankName: optional(formData.get("bankName")), bic: optional(formData.get("bic")) }),
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

export async function createInsuranceAction(clientId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const type = formData.get("type");
  if (typeof type !== "string" || !type.trim()) {
    return { error: "Le type d'assurance est obligatoire." };
  }
  try {
    await appApiFetch(`/api/v1/clients/${clientId}/insurances`, {
      method: "POST",
      body: JSON.stringify({
        type,
        insurer: optional(formData.get("insurer")),
        policyNumber: optional(formData.get("policyNumber")),
        expiresAt: optional(formData.get("expiresAt")),
      }),
    });
  } catch (error) {
    return { error: describeCompanyProfileActionError(error) };
  }
  revalidatePath(`/app/clients/${clientId}/company-profile`);
  return {};
}

export async function createCertificationAction(clientId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    return { error: "Le nom de la certification est obligatoire." };
  }
  try {
    await appApiFetch(`/api/v1/clients/${clientId}/certifications`, {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        issuer: optional(formData.get("issuer")),
        number: optional(formData.get("number")),
        expiresAt: optional(formData.get("expiresAt")),
      }),
    });
  } catch (error) {
    return { error: describeCompanyProfileActionError(error) };
  }
  revalidatePath(`/app/clients/${clientId}/company-profile`);
  return {};
}

export async function createReferenceAction(clientId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const projectName = formData.get("projectName");
  if (typeof projectName !== "string" || !projectName.trim()) {
    return { error: "Le nom du projet est obligatoire." };
  }
  try {
    await appApiFetch(`/api/v1/clients/${clientId}/references`, {
      method: "POST",
      body: JSON.stringify({
        projectName: projectName.trim(),
        referenceClientName: optional(formData.get("referenceClientName")),
        sector: optional(formData.get("sector")),
        amountValue: optional(formData.get("amountValue")),
        confidentiality: optional(formData.get("confidentiality")),
      }),
    });
  } catch (error) {
    return { error: describeCompanyProfileActionError(error) };
  }
  revalidatePath(`/app/clients/${clientId}/company-profile`);
  return {};
}

export async function createHumanResourceAction(clientId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const category = formData.get("category");
  const title = formData.get("title");
  if (typeof category !== "string" || !category.trim() || typeof title !== "string" || !title.trim()) {
    return { error: "Catégorie et intitulé sont obligatoires." };
  }
  const headcountRaw = formData.get("headcount");
  try {
    await appApiFetch(`/api/v1/clients/${clientId}/human-resources`, {
      method: "POST",
      body: JSON.stringify({
        category: category.trim(),
        title: title.trim(),
        headcount: typeof headcountRaw === "string" && headcountRaw.trim() ? Number(headcountRaw) : undefined,
        qualification: optional(formData.get("qualification")),
      }),
    });
  } catch (error) {
    return { error: describeCompanyProfileActionError(error) };
  }
  revalidatePath(`/app/clients/${clientId}/company-profile`);
  return {};
}

export async function createMaterialResourceAction(clientId: string, _prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const category = formData.get("category");
  const name = formData.get("name");
  if (typeof category !== "string" || !category.trim() || typeof name !== "string" || !name.trim()) {
    return { error: "Catégorie et nom sont obligatoires." };
  }
  const quantityRaw = formData.get("quantity");
  try {
    await appApiFetch(`/api/v1/clients/${clientId}/material-resources`, {
      method: "POST",
      body: JSON.stringify({
        category: category.trim(),
        name: name.trim(),
        quantity: typeof quantityRaw === "string" && quantityRaw.trim() ? Number(quantityRaw) : undefined,
      }),
    });
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
