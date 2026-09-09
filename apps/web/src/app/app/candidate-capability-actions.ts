"use server";

import { revalidatePath } from "next/cache";
import { AppApiError, appApiFetch } from "../../lib/app-api-client";
import type {
  CandidateBankAccount,
  CandidateCertification,
  CandidateDocument,
  CandidateHumanResource,
  CandidateInsurance,
  CandidateMaterialResource,
  CandidateReference,
  CandidateDocumentVersionsView,
  CandidateRepresentative,
} from "../../lib/candidate-capability-types";

/**
 * Checkpoint TENDEROS-2.1-CCV2-F — accès aux capacités, documents et coordonnées bancaires de
 * l'entreprise candidate.
 *
 * TOUTES les lectures et TOUTES les écritures passent par les routes `/candidate-companies/:id/*`
 * (CCV2-C, C.1, D). Aucun appel à `/clients/:id/*`, aucune lecture complémentaire de
 * `CompanyProfile`, aucun repli sur `sourceClientAccountId` : la fiche candidate n'a plus aucune
 * dépendance Legacy. Le Legacy reste en place côté backend, simplement plus consommé ici.
 *
 * `organizationId` n'est JAMAIS envoyé dans un corps de requête : il est déterminé par le contexte
 * d'organisation côté serveur (`appApiFetch`). Idem pour `candidateCompanyId`, porté par le chemin.
 */

/**
 * `savedAt` (Checkpoint CCV2-F.2) — horodatage d'un enregistrement REUSSI. Un etat vide `{}` ne
 * suffit pas a distinguer « pas encore soumis » de « soumis avec succes » : sans ce marqueur, un
 * formulaire ne peut pas se refermer tout seul apres une sauvegarde. Optionnel, donc sans effet sur
 * les formulaires qui ne s'en servent pas.
 */
export type CapabilityActionState = { error?: string; savedAt?: number };

type CapabilityFamily = "representatives" | "insurances" | "certifications" | "references" | "human-resources" | "material-resources";

function describeCandidateApiError(error: unknown, context: string): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] ${context} (${error.status} ${error.code}): ${error.message}`);
    switch (error.status) {
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action.";
      case 404:
        return "Cet élément n'existe plus ou n'est plus accessible.";
      case 409:
        return "Cet élément existe déjà pour cette entreprise candidate.";
      case 422:
        return "Certaines valeurs sont invalides. Vérifiez les champs signalés.";
      default:
        return error.status >= 500 ? "Une erreur serveur est survenue. Veuillez réessayer." : "Une erreur est survenue.";
    }
  }
  console.error(`[TenderOS] Unexpected error — ${context}:`, error);
  return "Une erreur réseau est survenue. Vérifiez votre connexion et réessayez.";
}

function optional(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.trim();
}

function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  const raw = optional(value);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Une lecture de capacité ne doit jamais faire échouer la fiche entière : une section
 *  indisponible (403 banking, 404 transitoire) se rend vide, la page reste utilisable. */
async function listOrEmpty<T>(path: string): Promise<T[]> {
  try {
    const page = await appApiFetch<{ items: T[] }>(path);
    return page.items;
  } catch (error) {
    if (error instanceof AppApiError && (error.status === 403 || error.status === 404)) return [];
    throw error;
  }
}

const base = (candidateCompanyId: string): string => `/api/v1/candidate-companies/${candidateCompanyId}`;

// ---------------------------------------------------------------- lectures

export async function fetchCandidateRepresentatives(id: string): Promise<CandidateRepresentative[]> {
  return listOrEmpty<CandidateRepresentative>(`${base(id)}/representatives`);
}
export async function fetchCandidateCertifications(id: string): Promise<CandidateCertification[]> {
  return listOrEmpty<CandidateCertification>(`${base(id)}/certifications`);
}
export async function fetchCandidateInsurances(id: string): Promise<CandidateInsurance[]> {
  return listOrEmpty<CandidateInsurance>(`${base(id)}/insurances`);
}
export async function fetchCandidateReferences(id: string): Promise<CandidateReference[]> {
  return listOrEmpty<CandidateReference>(`${base(id)}/references`);
}
export async function fetchCandidateHumanResources(id: string): Promise<CandidateHumanResource[]> {
  return listOrEmpty<CandidateHumanResource>(`${base(id)}/human-resources`);
}
export async function fetchCandidateMaterialResources(id: string): Promise<CandidateMaterialResource[]> {
  return listOrEmpty<CandidateMaterialResource>(`${base(id)}/material-resources`);
}
export async function fetchCandidateDocuments(id: string): Promise<CandidateDocument[]> {
  return listOrEmpty<CandidateDocument>(`${base(id)}/documents`);
}

/**
 * Coordonnées bancaires. Un rôle sans `candidate:read_banking` reçoit 403 : la section se rend
 * vide plutôt que de casser la page. Le masquage d'interface n'est PAS la sécurité — c'est le
 * backend qui refuse, ici on ne fait qu'éviter un écran d'erreur inutile.
 */
export async function fetchCandidateBankAccounts(id: string): Promise<CandidateBankAccount[]> {
  return listOrEmpty<CandidateBankAccount>(`${base(id)}/bank-accounts`);
}

// ---------------------------------------------------------------- écritures

/** Corps de création par famille — construit à partir des seuls champs du formulaire concerné,
 *  jamais un `Object.fromEntries(formData)` qui laisserait passer des clés arbitraires. */
function buildCapabilityBody(family: CapabilityFamily, formData: FormData): Record<string, unknown> {
  switch (family) {
    case "representatives":
      return {
        firstName: optional(formData.get("firstName")),
        lastName: optional(formData.get("lastName")),
        type: optional(formData.get("type")),
        jobTitle: optional(formData.get("jobTitle")),
        email: optional(formData.get("email")),
        phone: optional(formData.get("phone")),
      };
    case "insurances":
      return {
        type: optional(formData.get("type")),
        insurer: optional(formData.get("insurer")),
        policyNumber: optional(formData.get("policyNumber")),
        expiresAt: optional(formData.get("expiresAt")),
        coverageScope: optional(formData.get("coverageScope")),
      };
    case "certifications":
      return {
        name: optional(formData.get("name")),
        issuer: optional(formData.get("issuer")),
        number: optional(formData.get("number")),
        obtainedAt: optional(formData.get("obtainedAt")),
        expiresAt: optional(formData.get("expiresAt")),
      };
    case "references":
      return {
        projectName: optional(formData.get("projectName")),
        referenceClientName: optional(formData.get("referenceClientName")),
        sector: optional(formData.get("sector")),
        description: optional(formData.get("description")),
      };
    case "human-resources":
      return {
        category: optional(formData.get("category")),
        title: optional(formData.get("title")),
        headcount: optionalNumber(formData.get("headcount")) ?? 1,
        qualification: optional(formData.get("qualification")),
      };
    case "material-resources":
      return {
        category: optional(formData.get("category")),
        name: optional(formData.get("name")),
        quantity: optionalNumber(formData.get("quantity")) ?? 1,
        description: optional(formData.get("description")),
      };
  }
}

function pruneUndefined(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
}

export async function createCandidateCapabilityAction(
  candidateCompanyId: string,
  family: CapabilityFamily,
  _prevState: CapabilityActionState,
  formData: FormData,
): Promise<CapabilityActionState> {
  try {
    await appApiFetch(`${base(candidateCompanyId)}/${family}`, {
      method: "POST",
      body: JSON.stringify(pruneUndefined(buildCapabilityBody(family, formData))),
    });
  } catch (error) {
    return { error: describeCandidateApiError(error, `create ${family}`) };
  }
  revalidatePath(`/app/candidate-companies/${candidateCompanyId}`);
  return {};
}

/** Archivage (DELETE côté API) — jamais une suppression physique : c'est la règle du domaine, une
 *  capacité déjà citée par un dossier de réponse ne doit pas disparaître sous lui. */
export async function archiveCandidateCapabilityAction(
  candidateCompanyId: string,
  family: CapabilityFamily,
  capabilityId: string,
): Promise<CapabilityActionState> {
  try {
    await appApiFetch(`${base(candidateCompanyId)}/${family}/${capabilityId}`, { method: "DELETE" });
  } catch (error) {
    return { error: describeCandidateApiError(error, `archive ${family}`) };
  }
  revalidatePath(`/app/candidate-companies/${candidateCompanyId}`);
  return {};
}

/**
 * Checkpoint TENDEROS-2.1-CCV2-F.2 — gap F2-02 : édition NATIVE de l'identité juridique.
 *
 * `PATCH /candidate-companies/:id` uniquement. AUCUNE écriture `CompanyProfile`, aucun
 * double-écriture : les deux surfaces ne sont pas synchronisées, et le devenir serait précisément
 * le double-écriture que CCV2 interdit.
 *
 * Seuls les champs présents dans le formulaire sont envoyés. Un champ VIDÉ par l'utilisateur part
 * en `null` explicite — l'API distingue « absent » (ne pas toucher) de `null` (effacer) ; envoyer
 * `undefined` rendrait tout champ optionnel ineffaçable une fois renseigné.
 */
export async function updateCandidateIdentityAction(
  candidateCompanyId: string,
  _prevState: CapabilityActionState,
  formData: FormData,
): Promise<CapabilityActionState> {
  const body: Record<string, string | null> = {};
  const name = optional(formData.get("name"));
  if (name) body.name = name;
  for (const field of ["legalName", "tradeName", "siren", "vatNumber", "legalForm"] as const) {
    // `has` distingue « le formulaire porte ce champ » de « il ne le porte pas du tout ».
    if (!formData.has(field)) continue;
    body[field] = optional(formData.get(field)) ?? null;
  }

  if (Object.keys(body).length === 0) {
    return { error: "Aucune modification à enregistrer." };
  }

  try {
    await appApiFetch(`/api/v1/candidate-companies/${candidateCompanyId}`, { method: "PATCH", body: JSON.stringify(body) });
  } catch (error) {
    return { error: describeCandidateApiError(error, "update candidate identity") };
  }
  // La fiche ENTIÈRE est revalidée : la vue d'ensemble et l'onglet Identité lisent tous deux la
  // même entreprise candidate, en laisser un afficher l'ancienne valeur serait le défaut.
  revalidatePath(`/app/candidate-companies/${candidateCompanyId}`);
  revalidatePath("/app/candidate-companies");
  return { savedAt: Date.now() };
}

/**
 * Checkpoint CCV2-F.1 — gap F1 : historique des versions d'une pièce candidate.
 *
 * Lecture seule, via la façade `GET /candidate-companies/:id/documents/:documentId/versions`. La
 * version courante vient du pointeur porté par le Document, jamais du numéro le plus élevé : une
 * reconstruction côté interface pourrait diverger du pointeur réel et désigner comme « courante »
 * une version qui ne l'est pas.
 */
export async function fetchCandidateDocumentVersions(candidateCompanyId: string, documentId: string): Promise<CandidateDocumentVersionsView> {
  return appApiFetch<CandidateDocumentVersionsView>(`${base(candidateCompanyId)}/documents/${documentId}/versions`);
}

/**
 * Checkpoint CCV2-F.1 — gap F2 : le parcours d'ajout ne demande plus un UUID saisi à la main.
 *
 * Deux chemins réels, et AUCUN second moteur documentaire : soit l'utilisateur dépose un fichier —
 * il est alors téléversé par `POST /documents` puis rattaché — soit il choisit une pièce déjà
 * présente dans la bibliothèque, désignée par son titre et non par son identifiant.
 *
 * ÉCHEC PARTIEL ASSUMÉ ET DIT : si le téléversement réussit mais que le rattachement est refusé
 * (le moteur documentaire et l'entreprise candidate ont deux paliers de droits distincts — un
 * CONTRIBUTOR peut créer un Document sans détenir `candidate:upload_documents`), le fichier reste
 * dans la bibliothèque générale. Il n'est PAS supprimé en compensation : détruire un fichier que
 * l'utilisateur vient de déposer serait un dégât plus grave qu'un rattachement manquant. Le message
 * le dit explicitement plutôt que de laisser croire que rien ne s'est passé.
 */
export async function uploadAndAttachCandidateDocumentAction(
  candidateCompanyId: string,
  _prevState: CapabilityActionState,
  formData: FormData,
): Promise<CapabilityActionState> {
  const file = formData.get("file");
  const existingDocumentId = optional(formData.get("existingDocumentId"));
  const hasFile = file instanceof File && file.size > 0;

  if (!hasFile && !existingDocumentId) {
    return { error: "Déposez un fichier ou choisissez une pièce déjà présente dans la bibliothèque." };
  }
  if (hasFile && existingDocumentId) {
    return { error: "Choisissez l'un ou l'autre : un nouveau fichier, ou une pièce existante." };
  }

  const label = optional(formData.get("label"));
  let documentId = existingDocumentId;

  if (hasFile) {
    const upload = new FormData();
    upload.set("title", label ?? file.name);
    upload.set("origin", "USER_UPLOAD");
    upload.set("domain", "ORGANIZATION");
    upload.set("file", file);
    try {
      documentId = (await appApiFetch<{ id: string }>("/api/v1/documents", { method: "POST", body: upload })).id;
    } catch (error) {
      return { error: describeCandidateApiError(error, "upload candidate document") };
    }
  }

  const result = await attachCandidateDocumentAction(candidateCompanyId, documentId as string, _prevState, formData);
  if (result.error && hasFile) {
    return { error: `${result.error} Le fichier a bien été déposé dans la bibliothèque documentaire, mais n'a pas pu être rattaché à cette entreprise candidate.` };
  }
  return result;
}

/** Rattache un Document DÉJÀ téléversé par le moteur documentaire. Le téléversement lui-même reste
 *  `POST /documents` : le dupliquer ici recréerait validation MIME, checksum et versionnement. */
export async function attachCandidateDocumentAction(
  candidateCompanyId: string,
  documentId: string,
  _prevState: CapabilityActionState,
  formData: FormData,
): Promise<CapabilityActionState> {
  const body = pruneUndefined({
    documentId,
    category: optional(formData.get("category")),
    label: optional(formData.get("label")),
    issuedAt: optional(formData.get("issuedAt")),
    validFrom: optional(formData.get("validFrom")),
    validUntil: optional(formData.get("validUntil")),
  });
  try {
    await appApiFetch(`${base(candidateCompanyId)}/documents`, { method: "POST", body: JSON.stringify(body) });
  } catch (error) {
    return { error: describeCandidateApiError(error, "attach document") };
  }
  revalidatePath(`/app/candidate-companies/${candidateCompanyId}`);
  return {};
}

/** Dissociation — le fichier n'est jamais détruit : il peut rester rattaché à un Tender ou à un
 *  dossier de réponse déjà déposé. */
export async function detachCandidateDocumentAction(candidateCompanyId: string, documentId: string): Promise<CapabilityActionState> {
  try {
    await appApiFetch(`${base(candidateCompanyId)}/documents/${documentId}`, { method: "DELETE" });
  } catch (error) {
    return { error: describeCandidateApiError(error, "detach document") };
  }
  revalidatePath(`/app/candidate-companies/${candidateCompanyId}`);
  return {};
}

export async function createCandidateBankAccountAction(
  candidateCompanyId: string,
  _prevState: CapabilityActionState,
  formData: FormData,
): Promise<CapabilityActionState> {
  const body = pruneUndefined({
    accountHolder: optional(formData.get("accountHolder")),
    bankName: optional(formData.get("bankName")),
    iban: optional(formData.get("iban")),
    bic: optional(formData.get("bic")),
    currency: optional(formData.get("currency")),
    isPrimary: formData.get("isPrimary") === "on" ? true : undefined,
  });
  try {
    await appApiFetch(`${base(candidateCompanyId)}/bank-accounts`, { method: "POST", body: JSON.stringify(body) });
  } catch (error) {
    return { error: describeCandidateApiError(error, "create bank account") };
  }
  revalidatePath(`/app/candidate-companies/${candidateCompanyId}`);
  return {};
}

export async function archiveCandidateBankAccountAction(candidateCompanyId: string, bankAccountId: string): Promise<CapabilityActionState> {
  try {
    await appApiFetch(`${base(candidateCompanyId)}/bank-accounts/${bankAccountId}`, { method: "DELETE" });
  } catch (error) {
    return { error: describeCandidateApiError(error, "archive bank account") };
  }
  revalidatePath(`/app/candidate-companies/${candidateCompanyId}`);
  return {};
}
