"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  APP_ORGANIZATION_COOKIE,
  APP_SESSION_COOKIE,
  AppApiError,
  appApiFetch,
  appApiFetchWithToken,
} from "../../lib/app-api-client";
import {
  AWARD_TYPES,
  DEFAULT_TENDER_SOURCE,
  isValidEstimatedAmount,
  MARKET_TYPES,
  TENDER_COUNTRIES,
  TENDER_LANGUAGES,
  type AwardType,
  type Buyer,
  type MarketType,
  type TenderCountry,
  type TenderLanguage,
  type PageResponse,
  type MyMembership,
  type Tender,
} from "../../lib/tenders-types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Une erreur est survenue.";
}

/**
 * Distingue les erreurs API par statut (mission "Erreurs API") — jamais uniquement
 * "Unexpected error" : un message utilisateur comprehensible en francais, les details
 * techniques (statut, code, message brut) restant dans les logs serveur (console.error, jamais
 * affiches a l'utilisateur). Reserve aux actions Tender create/update pour rester dans le
 * perimetre de cette mission ; les autres actions du fichier gardent errorMessage() inchange.
 */
function describeTenderActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Tender action failed (${error.status} ${error.code}): ${error.message}`);
    switch (error.status) {
      case 400:
        return "Certains champs de l'appel d'offres sont invalides.";
      case 401:
        return "Votre session a expire. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits necessaires pour cette action.";
      case 404:
        return "Cet appel d'offres est introuvable.";
      case 409:
        return "Cette action entre en conflit avec l'etat actuel de l'appel d'offres.";
      default:
        return error.status >= 500
          ? "Une erreur serveur est survenue. Veuillez reessayer."
          : "Une erreur est survenue lors de l'enregistrement de l'appel d'offres.";
    }
  }
  console.error("[TenderOS] Unexpected error while saving a tender:", error);
  return "Une erreur est survenue.";
}

/**
 * Champs partages entre creation et edition (mission "Champs a prendre en charge") — valides une
 * seule fois ici, jamais duplique entre createTenderAction et updateTenderAction.
 *
 * `source` est volontairement EXCLU de ce type et jamais lu depuis `formData` ici (correction
 * securite) : c'est un champ de provenance (comment le Tender est arrive dans le systeme), jamais
 * une donnee que l'utilisateur doit pouvoir choisir librement depuis un formulaire. Le select qui
 * l'affiche est `disabled` cote UI, mais un champ HTML desactive n'est qu'une restriction
 * visuelle — n'importe quel FormData reconstruit a la main (devtools, requete forgee) pourrait
 * autrement porter `source=TED` et faire passer une saisie manuelle pour un import BOAMP/TED.
 * `createTenderAction` fixe donc `source` en dur a MANUAL, et `updateTenderAction` ne l'envoie
 * jamais (le backend laisse alors la valeur existante inchangee, mission "conserver la source
 * existante") : le contenu de `formData.get("source")` n'a plus aucune influence, quel qu'il soit.
 */
type ParsedTenderFields = {
  reference?: string | undefined;
  buyerName?: string | undefined;
  buyerId?: string | undefined;
  procedureType?: string | undefined;
  marketType?: MarketType | undefined;
  country?: TenderCountry | undefined;
  language?: TenderLanguage | undefined;
  currency?: string | undefined;
  estimatedAmount?: string | undefined;
  minimumAmount?: string | undefined;
  maximumAmount?: string | undefined;
  submissionDeadline?: string | undefined;
  submissionDeadlineTimezone?: string | undefined;
  questionsDeadline?: string | undefined;
  visitDate?: string | undefined;
  visitMandatory?: boolean | undefined;
  isFrameworkAgreement?: boolean | undefined;
  awardType?: AwardType | undefined;
  variantsAllowed?: boolean | undefined;
  submissionPlatformUrl?: string | undefined;
  internalNotes?: string | undefined;
};

/** Date+heure optionnelle -> ISO 8601, meme regle que submissionDeadline (mission §6 : tous les
 *  champs de dates restent optionnels, jamais bloquant si absent/invalide non fourni). */
function parseOptionalIsoDate(value: FormDataEntryValue | null, fieldLabel: string): { error: string } | { value: string | undefined } {
  if (typeof value !== "string" || !value) {
    return { value: undefined };
  }
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return { error: `${fieldLabel} invalide.` };
  }
  return { value: parsedDate.toISOString() };
}

/** Tri-etat "ne pas preciser / oui / non" (mission §6 : champs optionnels) — un select plutot
 *  qu'une case a cocher, pour pouvoir explicitement REMETTRE un booleen a "non renseigne" sans
 *  ambiguite (une case a cocher ne peut representer que deux etats, jamais trois). */
function optionalBoolean(value: FormDataEntryValue | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseTenderFormFields(formData: FormData): { error: string } | { fields: ParsedTenderFields } {
  const marketType = optional(formData.get("marketType"));
  if (marketType && !(MARKET_TYPES as readonly string[]).includes(marketType)) {
    return { error: "Type de marche invalide." };
  }
  const country = optional(formData.get("country"));
  if (country && !(TENDER_COUNTRIES as readonly string[]).includes(country)) {
    return { error: "Pays invalide." };
  }
  const language = optional(formData.get("language"));
  if (language && !(TENDER_LANGUAGES as readonly string[]).includes(language)) {
    return { error: "Langue invalide." };
  }
  const currency = optional(formData.get("currency"));
  if (currency && currency.length !== 3) {
    return { error: "Devise invalide (code sur 3 lettres attendu)." };
  }
  const estimatedAmount = optional(formData.get("estimatedAmount"));
  if (estimatedAmount && !isValidEstimatedAmount(estimatedAmount)) {
    return { error: "Montant estime invalide (nombre positif attendu, par exemple 50000 ou 50000.50)." };
  }
  const minimumAmount = optional(formData.get("minimumAmount"));
  if (minimumAmount && !isValidEstimatedAmount(minimumAmount)) {
    return { error: "Montant minimum invalide (nombre positif attendu)." };
  }
  const maximumAmount = optional(formData.get("maximumAmount"));
  if (maximumAmount && !isValidEstimatedAmount(maximumAmount)) {
    return { error: "Montant maximum invalide (nombre positif attendu)." };
  }
  const awardTypeRaw = optional(formData.get("awardType"));
  if (awardTypeRaw && !(AWARD_TYPES as readonly string[]).includes(awardTypeRaw)) {
    return { error: "Type d'attribution invalide." };
  }

  const submissionDeadline = parseOptionalIsoDate(formData.get("submissionDeadline"), "Date limite de remise");
  if ("error" in submissionDeadline) return submissionDeadline;
  const questionsDeadline = parseOptionalIsoDate(formData.get("questionsDeadline"), "Date limite des questions");
  if ("error" in questionsDeadline) return questionsDeadline;
  const visitDate = parseOptionalIsoDate(formData.get("visitDate"), "Date de visite");
  if ("error" in visitDate) return visitDate;

  return {
    fields: {
      reference: optional(formData.get("reference")),
      buyerName: optional(formData.get("buyerName")),
      buyerId: optional(formData.get("buyerId")),
      procedureType: optional(formData.get("procedureType")),
      marketType: marketType as MarketType | undefined,
      country: country as TenderCountry | undefined,
      language: language as TenderLanguage | undefined,
      currency,
      estimatedAmount,
      minimumAmount,
      maximumAmount,
      submissionDeadline: submissionDeadline.value,
      submissionDeadlineTimezone: optional(formData.get("submissionDeadlineTimezone")),
      questionsDeadline: questionsDeadline.value,
      visitDate: visitDate.value,
      visitMandatory: optionalBoolean(formData.get("visitMandatory")),
      isFrameworkAgreement: optionalBoolean(formData.get("isFrameworkAgreement")),
      awardType: awardTypeRaw as AwardType | undefined,
      variantsAllowed: optionalBoolean(formData.get("variantsAllowed")),
      submissionPlatformUrl: optional(formData.get("submissionPlatformUrl")),
      internalNotes: optional(formData.get("internalNotes")),
    },
  };
}

export type LoginActionState = { error?: string };

/**
 * Authentifie via Identity, PUIS résout l'organisation de travail à partir de la première
 * Membership active de l'utilisateur (aucun sélecteur multi-organisation dans cette tranche —
 * mission Tenders : périmètre volontairement réduit, à étendre si un utilisateur multi-org
 * en a besoin).
 */
export async function loginAction(_prevState: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return { error: "Email et mot de passe requis." };
  }

  const loginResponse = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  if (!loginResponse.ok) {
    return { error: "Identifiants invalides." };
  }

  const loginBody = (await loginResponse.json()) as { accessToken: string; expiresAt: string };

  let memberships: PageResponse<MyMembership>;
  try {
    memberships = await appApiFetchWithToken<PageResponse<MyMembership>>(
      loginBody.accessToken,
      "/api/v1/organization-memberships/me?limit=1",
    );
  } catch {
    return { error: "Impossible de resoudre votre organisation." };
  }

  const organizationId = memberships.items[0]?.organization.id;
  if (!organizationId) {
    return { error: "Ce compte n'est associe a aucune organisation." };
  }

  const cookieStore = await cookies();
  const expires = new Date(loginBody.expiresAt);
  cookieStore.set(APP_SESSION_COOKIE, loginBody.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/app",
    expires,
  });
  cookieStore.set(APP_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/app",
    expires,
  });

  redirect("/app/tenders");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(APP_SESSION_COOKIE)?.value;

  if (token) {
    await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }).catch(() => undefined);
  }

  cookieStore.delete(APP_SESSION_COOKIE);
  cookieStore.delete(APP_ORGANIZATION_COOKIE);
  redirect("/app/login");
}

export type FormActionState = { error?: string };

export async function createTenderAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const title = formData.get("title");
  if (typeof title !== "string" || !title.trim()) {
    return { error: "Le titre est obligatoire." };
  }

  // Mission Sprint 5.1 §"Tenders" — un client autorisé est obligatoire à la création, jamais
  // modifiable ensuite (voir updateTenderAction, qui ne lit jamais ce champ).
  const clientAccountId = formData.get("clientAccountId");
  if (typeof clientAccountId !== "string" || !clientAccountId.trim()) {
    return { error: "Le client est obligatoire." };
  }

  const parsed = parseTenderFormFields(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  let tender: Tender;
  try {
    tender = await appApiFetch<Tender>("/api/v1/tenders", {
      method: "POST",
      body: JSON.stringify({
        title: title.trim(),
        clientAccountId,
        ...parsed.fields,
        // Correction securite : jamais lu depuis formData (voir ParsedTenderFields) — ce
        // formulaire ne cree que des Tenders manuels, quelle que soit la valeur eventuellement
        // falsifiee d'un champ "source" dans la requete.
        source: DEFAULT_TENDER_SOURCE,
      }),
    });
  } catch (error) {
    return { error: describeTenderActionError(error) };
  }

  revalidatePath("/app/tenders");
  redirect(`/app/tenders/${tender.id}`);
}

function optional(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function updateTenderAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const titleRaw = formData.get("title");
  const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
  if (!title) {
    return { error: "Le titre est obligatoire." };
  }

  const parsed = parseTenderFormFields(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  try {
    // Correction securite : "source" n'apparait jamais dans ce corps (voir ParsedTenderFields) —
    // le backend traite une cle absente comme "valeur inchangee" (PATCH partiel), ce qui
    // conserve la source existante quoi que porte formData.get("source").
    await appApiFetch(`/api/v1/tenders/${tenderId}`, {
      method: "PATCH",
      body: JSON.stringify({
        title,
        description: optional(formData.get("description")),
        ...parsed.fields,
      }),
    });
  } catch (error) {
    return { error: describeTenderActionError(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function changeTenderStatusAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const status = formData.get("status");
  if (typeof status !== "string" || !status) {
    return { error: "Statut requis." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/status`, { method: "POST", body: JSON.stringify({ status }) });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

/**
 * Meme endpoint et meme use case que changeTenderStatusAction (POST /tenders/:id/status,
 * ChangeTenderStatusUseCase) — variante en fonction directement appelable plutot que liee a
 * useActionState, pour le glisser-deposer du Kanban (mission Kanban & List Views §4) :
 * aucune nouvelle logique metier, le backend revalide la transition, les permissions,
 * l'organisation et ecrit l'audit exactement comme depuis la fiche Tender.
 */
export async function changeTenderStatusDirectAction(
  tenderId: string,
  status: string,
): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/status`, {
      method: "POST",
      body: JSON.stringify({ status, reason: "Deplacement Kanban" }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  revalidatePath("/app/tenders");
  revalidatePath("/app/tenders/board");
  return {};
}

export async function archiveTenderAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const reason = optional(formData.get("reason"));

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/archive`, {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  revalidatePath("/app/tenders");
  return {};
}

/** Correctif V2 Sprint 3 §7/§29 — la restauration transitionne toujours vers DRAFT (jamais le
 *  statut precedent l'archivage, non conserve), meme endpoint dedie que le backend
 *  (RestoreTenderUseCase), jamais via changeTenderStatusAction. */
export async function restoreTenderAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const reason = optional(formData.get("reason"));

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/restore`, {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    });
  } catch (error) {
    return { error: describeTenderActionError(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  revalidatePath("/app/tenders");
  return {};
}

/**
 * V2 Sprint 3 §4 — changement CONTROLE de l'entreprise candidate, jamais fusionne avec
 * updateTenderAction (le backend rejette de toute facon tout `clientAccountId` glisse dans un
 * PATCH general). Route dediee POST /tenders/:id/candidate (ChangeTenderClientAccountUseCase).
 */
export async function changeTenderCandidateAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const clientAccountId = formData.get("clientAccountId");
  if (typeof clientAccountId !== "string" || !clientAccountId.trim()) {
    return { error: "Selectionnez une entreprise candidate." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/candidate`, {
      method: "POST",
      body: JSON.stringify({ clientAccountId, reason: optional(formData.get("reason")) }),
    });
  } catch (error) {
    return { error: describeTenderActionError(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

// ---- Acheteurs (Buyer, V2 Sprint 3 §5) ----

export async function createBuyerAction(
  redirectToTenderId: string | undefined,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    return { error: "Le nom de l'acheteur est obligatoire." };
  }

  try {
    await appApiFetch<Buyer>("/api/v1/buyers", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        legalName: optional(formData.get("legalName")),
        siret: optional(formData.get("siret")),
        addressLine: optional(formData.get("addressLine")),
        postalCode: optional(formData.get("postalCode")),
        city: optional(formData.get("city")),
        buyerType: optional(formData.get("buyerType")),
        contactName: optional(formData.get("contactName")),
        contactEmail: optional(formData.get("contactEmail")),
        contactPhone: optional(formData.get("contactPhone")),
        profileUrl: optional(formData.get("profileUrl")),
      }),
    });
  } catch (error) {
    return { error: describeTenderActionError(error) };
  }

  if (redirectToTenderId) {
    revalidatePath(`/app/tenders/${redirectToTenderId}`);
  }
  revalidatePath("/app/tenders/new");
  return {};
}

// ---- Lots ----

export async function createLotAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const lotNumber = formData.get("lotNumber");
  const title = formData.get("title");
  if (typeof lotNumber !== "string" || !lotNumber || typeof title !== "string" || !title) {
    return { error: "Numero et titre du lot requis." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/lots`, {
      method: "POST",
      body: JSON.stringify({ lotNumber, title, estimatedAmount: optional(formData.get("estimatedAmount")) }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function updateLotAction(
  tenderId: string,
  lotId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const title = formData.get("title");
  if (typeof title !== "string" || !title.trim()) {
    return { error: "Le titre est obligatoire." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/lots/${lotId}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: title.trim(),
        description: optional(formData.get("description")),
        estimatedAmount: optional(formData.get("estimatedAmount")),
      }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

/** Suppression logique (conception Lots §D) — jamais physique. */
export async function deleteLotAction(tenderId: string, lotId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/lots/${lotId}`, { method: "DELETE" });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

/** Repositionne le lot restaure en fin de liste active (conception Lots §E) — jamais a son
 *  ancienne position. Accessible uniquement depuis l'action "Annuler" qui suit une suppression
 *  dans la meme session (pas d'ecran dedie aux lots supprimes en V1, conception Lots §G). */
export async function restoreLotAction(tenderId: string, lotId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/lots/${lotId}/restore`, { method: "POST" });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

/** Envoie toujours la liste complete et ordonnee des lots actifs (conception Lots §E, §F) —
 *  jamais une position isolee. */
export async function reorderLotsAction(tenderId: string, lotIds: string[]): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/lots/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ lotIds }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

// ---- Checklist ----

export async function createChecklistItemAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const title = formData.get("title");
  if (typeof title !== "string" || !title) {
    return { error: "Le titre est obligatoire." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/checklist`, {
      method: "POST",
      body: JSON.stringify({ title, required: formData.get("required") === "on" }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function changeChecklistItemStatusAction(
  tenderId: string,
  itemId: string,
  status: string,
): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/checklist/${itemId}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

// ---- Award criteria ----

export async function createAwardCriterionAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const name = formData.get("name");
  const weight = formData.get("weight");
  if (typeof name !== "string" || !name || typeof weight !== "string" || !weight) {
    return { error: "Nom et pondération requis." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/criteria`, {
      method: "POST",
      body: JSON.stringify({ name, weight }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

// ---- Requested documents ----

export async function createRequestedDocumentAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const name = formData.get("name");
  if (typeof name !== "string" || !name) {
    return { error: "Le nom de la piece est obligatoire." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/requested-documents`, {
      method: "POST",
      body: JSON.stringify({
        name,
        category: optional(formData.get("category")),
        required: formData.get("required") === "on",
      }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

// ---- Milestones ----

export async function createMilestoneAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const title = formData.get("title");
  const date = formData.get("date");
  const type = formData.get("type");
  if (typeof title !== "string" || !title || typeof date !== "string" || !date) {
    return { error: "Titre et date requis." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/milestones`, {
      method: "POST",
      body: JSON.stringify({ title, date: new Date(date).toISOString(), type: type || "CUSTOM" }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function markMilestoneDoneAction(tenderId: string, milestoneId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/milestones/${milestoneId}/done`, { method: "POST" });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

// ---- Risks ----

export async function createRiskAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const title = formData.get("title");
  const severity = formData.get("severity");
  if (typeof title !== "string" || !title || typeof severity !== "string" || !severity) {
    return { error: "Titre et gravite requis." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/risks`, { method: "POST", body: JSON.stringify({ title, severity }) });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function changeRiskStatusAction(
  tenderId: string,
  riskId: string,
  status: string,
): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/risks/${riskId}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

// ---- Alerts ----

export async function createAlertAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const message = formData.get("message");
  const severity = formData.get("severity");
  if (typeof message !== "string" || !message || typeof severity !== "string" || !severity) {
    return { error: "Message et gravite requis." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/alerts`, {
      method: "POST",
      body: JSON.stringify({ type: "MANUAL", severity, message, source: "MANUAL" }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function resolveAlertAction(tenderId: string, alertId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/alerts/${alertId}/resolve`, { method: "POST" });
  } catch (error) {
    return { error: errorMessage(error) };
  }

  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}
