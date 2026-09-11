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
import { PublicApiError, publicApiPost } from "../../lib/public-api-client";
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
  type ChecklistDocumentMatchResult,
  type ChecklistProgress,
} from "../../lib/tenders-types";
import { apiErrorMessage, describeApiError } from "../../lib/api-error-messages";
import { describeLoginFailure } from "../../lib/login-error";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

/** Toujours un message français, jamais le texte brut d'une erreur de l'API ou du réseau
 *  (voir lib/api-error-messages.ts). Le détail reste journalisé pour l'analyse. */
function errorMessage(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Action failed (${error.status} ${error.code}): ${error.message}`);
  } else {
    console.error("[TenderOS] Unexpected action error:", error);
  }
  return describeApiError(error);
}

/**
 * Distingue les erreurs API par statut (mission "Erreurs API") — jamais uniquement
 * "Unexpected error" : un message utilisateur comprehensible en francais, les details
 * techniques (statut, code, message brut) restant dans les logs serveur (console.error, jamais
 * affiches a l'utilisateur). Reserve aux actions Tender create/update ; les autres actions du
 * fichier passent par errorMessage(). Les deux consultent d'abord la table des codes d'erreur.
 */
function describeTenderActionError(error: unknown): string {
  if (error instanceof AppApiError) {
    console.error(`[TenderOS] Tender action failed (${error.status} ${error.code}): ${error.message}`);
    const known = apiErrorMessage(error);
    if (known) return known;
    switch (error.status) {
      case 400:
        return "Certains champs de l'appel d'offres sont invalides.";
      case 401:
        return "Votre session a expiré. Veuillez vous reconnecter.";
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action.";
      case 404:
        return "Cet appel d'offres est introuvable.";
      case 409:
        return "Cette action entre en conflit avec l'état actuel de l'appel d'offres.";
      default:
        return error.status >= 500
          ? "Une erreur serveur est survenue. Veuillez réessayer."
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
    return { error: "Type de marché invalide." };
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
    return { error: "Montant estimé invalide (nombre positif attendu, par exemple 50000 ou 50000.50)." };
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

/** V2 Sprint 24 (refonte /app/login) — anti open-redirect (mission) : SEULS des chemins internes
 *  connus sont acceptés, jamais une URL absolue/protocole-relative fournie par le client. Toute
 *  autre valeur retombe sur la destination par défaut, jamais un fail-open. */
function sanitizeReturnTo(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return /^\/(app|onboarding)(\/|$|\?)/.test(value) ? value : undefined;
}

/**
 * Authentifie via Identity, PUIS résout l'organisation de travail à partir de la première
 * Membership active de l'utilisateur (aucun sélecteur multi-organisation dans cette tranche —
 * mission Tenders : périmètre volontairement réduit, à étendre si un utilisateur multi-org
 * en a besoin).
 *
 * V2 Sprint 24 (refonte /app/login) — un compte SANS Membership n'est plus un échec : il est
 * renvoyé vers `/onboarding`, qui résout lui-même l'étape exacte où reprendre (mission "owner
 * avec onboarding incomplet -> reprendre l'onboarding", jamais un message d'erreur qui bloque un
 * utilisateur légitime au milieu de son inscription). `returnTo` (validé, interne uniquement)
 * prime sur la redirection par défaut pour un membre existant.
 */
export async function loginAction(_prevState: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const returnTo = sanitizeReturnTo(formData.get("returnTo"));

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
    return { error: await describeLoginFailure(loginResponse) };
  }

  const loginBody = (await loginResponse.json()) as { accessToken: string; expiresAt: string };

  let memberships: PageResponse<MyMembership>;
  try {
    memberships = await appApiFetchWithToken<PageResponse<MyMembership>>(
      loginBody.accessToken,
      "/api/v1/organization-memberships/me?limit=1",
    );
  } catch {
    return { error: "Une erreur est survenue. Veuillez réessayer." };
  }

  const organizationId = memberships.items[0]?.organization.id;
  const cookieStore = await cookies();
  const expires = new Date(loginBody.expiresAt);
  // path: "/" (jamais "/app") — /onboarding a aussi besoin de lire ce cookie côté serveur pour
  // reprendre un onboarding incomplet après une connexion (voir ci-dessous).
  cookieStore.set(APP_SESSION_COOKIE, loginBody.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });

  if (!organizationId) {
    // Compte créé mais onboarding jamais terminé (jamais d'organisation) — /onboarding résout
    // lui-même l'étape exacte où reprendre, aucune logique dupliquée ici.
    redirect("/onboarding");
  }

  cookieStore.set(APP_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });

  redirect(returnTo ?? "/app/tenders");
}

export type ForgotPasswordActionState = { submitted?: boolean; error?: string };

/**
 * V2 Sprint 24 (onboarding, flow "Mot de passe oublié" — décision utilisateur explicite : flow
 * minimal complet, jamais un lien mort). Anti-énumération (mission 24.135) : le backend répond
 * toujours 204 quel que soit l'état du compte — `submitted: true` est renvoyé même si l'appel
 * échoue avec un statut < 500 (ex. corps invalide), jamais une nuance qui distinguerait "email
 * inconnu" d'un vrai succès. Seule une erreur serveur/réseau inattendue (5xx, timeout) affiche un
 * message d'erreur générique.
 */
export async function forgotPasswordAction(
  _prevState: ForgotPasswordActionState,
  formData: FormData,
): Promise<ForgotPasswordActionState> {
  const email = formData.get("email");
  if (typeof email !== "string" || !email.trim()) {
    return { error: "Veuillez saisir votre adresse email." };
  }

  try {
    await publicApiPost("/api/v1/auth/forgot-password", { email: email.trim() });
  } catch (error) {
    if (error instanceof PublicApiError && error.status < 500) {
      return { submitted: true };
    }
    console.error("[TenderOS] forgotPasswordAction failed:", error);
    return { error: "Une erreur est survenue. Veuillez réessayer." };
  }

  return { submitted: true };
}

export type ResetPasswordActionState = { success?: boolean; error?: string };

export async function resetPasswordAction(
  token: string,
  _prevState: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  const newPassword = formData.get("newPassword");
  const confirmPassword = formData.get("confirmPassword");

  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return { error: "Le mot de passe doit contenir au moins 8 caractères." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "Les mots de passe ne correspondent pas." };
  }

  try {
    await publicApiPost("/api/v1/auth/reset-password", { token, newPassword });
  } catch (error) {
    if (error instanceof PublicApiError && error.status === 400) {
      return { error: "Ce lien de réinitialisation est invalide ou a expiré. Demandez-en un nouveau lien." };
    }
    console.error("[TenderOS] resetPasswordAction failed:", error);
    return { error: "Une erreur est survenue. Veuillez réessayer." };
  }

  return { success: true };
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

  cookieStore.delete({ name: APP_SESSION_COOKIE, path: "/" });
  cookieStore.delete({ name: APP_ORGANIZATION_COOKIE, path: "/" });
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

  // Checkpoint TENDEROS-2.1-CCV2-G.1 — POLICY A : l'entreprise candidate (l'entité juridique qui
  // RÉPOND) est obligatoire, au même titre que le client. Le backend reste l'autorité
  // (`CANDIDATE_COMPANY_REQUIRED`) ; ce contrôle évite seulement un aller-retour inutile.
  const candidateCompanyId = formData.get("candidateCompanyId");
  if (typeof candidateCompanyId !== "string" || !candidateCompanyId.trim()) {
    return { error: "L'entreprise candidate est obligatoire." };
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
        candidateCompanyId,
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
  // mission §25.92 — `?created=1` : seul signal disponible pour un event "first_tender_started"
  // déclenché côté client (`FirstTenderTracker`), `trackEvent`/`window` étant inatteignables depuis
  // cette action serveur elle-même. Nettoyé par le tracker après lecture, jamais persisté dans l'URL.
  redirect(`/app/tenders/${tender.id}?created=1`);
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
      body: JSON.stringify({ status, reason: "Déplacement Kanban" }),
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
 * V2 Sprint 3 §4 — changement CONTROLE du CLIENT (ClientAccount), jamais fusionne avec
 * updateTenderAction (le backend rejette de toute facon tout `clientAccountId` glisse dans un
 * PATCH general). Route dediee POST /tenders/:id/candidate (ChangeTenderClientAccountUseCase) —
 * nom de route backend historique, jamais renomme en A5 (aucune reprise backend).
 * Checkpoint 2.1-A5 — renomme depuis `changeTenderCandidateAction` cote frontend uniquement.
 */
export async function changeTenderClientAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const clientAccountId = formData.get("clientAccountId");
  if (typeof clientAccountId !== "string" || !clientAccountId.trim()) {
    return { error: "Sélectionnez un client." };
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

/**
 * Checkpoint 2.1-A5 — changement de la CandidateCompany (A1-A4), route dediee distincte
 * POST /tenders/:id/candidate-company (ChangeTenderCandidateCompanyUseCase). Jamais confondu avec
 * changeTenderClientAction ci-dessus (deux concepts, deux routes, deux use cases backend).
 */
export async function changeTenderCandidateCompanyAction(
  tenderId: string,
  _prevState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const candidateCompanyId = formData.get("candidateCompanyId");
  if (typeof candidateCompanyId !== "string" || !candidateCompanyId.trim()) {
    return { error: "Sélectionnez une entreprise candidate." };
  }

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/candidate-company`, {
      method: "POST",
      body: JSON.stringify({ candidateCompanyId, reason: optional(formData.get("reason")) }),
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
    return { error: "Numéro et titre du lot requis." };
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

  const type = formData.get("type");
  const requirementLevel = formData.get("requirementLevel");
  const criticality = formData.get("criticality");

  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/checklist`, {
      method: "POST",
      body: JSON.stringify({
        title,
        required: formData.get("required") === "on",
        ...(typeof type === "string" && type ? { type } : {}),
        ...(typeof requirementLevel === "string" && requirementLevel ? { requirementLevel } : {}),
        ...(typeof criticality === "string" && criticality ? { criticality } : {}),
      }),
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

/** V2 Sprint 6 §20-21 — seule action (avec `markChecklistItemNotApplicableAction`) qui compte pour
 *  le score de readiness : une décision humaine explicite, jamais un simple document rapproché. */
export async function validateChecklistItemAction(tenderId: string, itemId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/checklist/${itemId}/validate`, { method: "POST" });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

/** V2 Sprint 8 §19 — promotion gouvernée, jamais silencieuse : l'utilisateur choisit
 *  explicitement le titre/la catégorie/les tags avant que la nouvelle entrée n'existe. */
export async function promoteChecklistItemToKnowledgeAction(
  tenderId: string,
  itemId: string,
  input: { title: string; category: string; tags?: string[] },
): Promise<{ error?: string; knowledgeEntryId?: string }> {
  let entry: { id: string };
  try {
    entry = await appApiFetch<{ id: string }>(`/api/v1/tenders/${tenderId}/checklist/${itemId}/promote-to-knowledge`, {
      method: "POST",
      body: JSON.stringify({ title: input.title, category: input.category, tags: input.tags }),
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}`);
  revalidatePath("/app/knowledge");
  return { knowledgeEntryId: entry.id };
}

export async function markChecklistItemNotApplicableAction(tenderId: string, itemId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/checklist/${itemId}/mark-not-applicable`, { method: "POST" });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

/** V2 Sprint 6 §16-17 — jamais une association automatique : cette action ne fait que RECHERCHER
 *  des candidats, `attachChecklistItemDocumentAction` reste le seul point d'écriture, toujours
 *  déclenché par un choix utilisateur explicite même sur un score EXACT_MATCH. */
export async function findChecklistItemDocumentMatchesAction(
  tenderId: string,
  itemId: string,
): Promise<{ result?: ChecklistDocumentMatchResult; error?: string }> {
  try {
    const result = await appApiFetch<ChecklistDocumentMatchResult>(`/api/v1/tenders/${tenderId}/checklist/${itemId}/document-matches`, { method: "POST" });
    return { result };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function attachChecklistItemDocumentAction(
  tenderId: string,
  itemId: string,
  input: { documentId: string; documentVersionId?: string | undefined; matchStatus: string; score?: number | undefined; reasons?: string[] | undefined; expiresAt?: string | undefined },
): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/checklist/${itemId}/attach-document`, { method: "POST", body: JSON.stringify(input) });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function detachChecklistItemDocumentAction(tenderId: string, itemId: string): Promise<{ error?: string }> {
  try {
    await appApiFetch(`/api/v1/tenders/${tenderId}/checklist/${itemId}/document`, { method: "DELETE" });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath(`/app/tenders/${tenderId}`);
  return {};
}

export async function fetchChecklistProgress(tenderId: string): Promise<ChecklistProgress | null> {
  try {
    return await appApiFetch<ChecklistProgress>(`/api/v1/tenders/${tenderId}/checklist/progress`);
  } catch {
    return null;
  }
}

export async function reconcileChecklistWithNewAnalysisAction(
  tenderId: string,
): Promise<{ result?: { analysisVersion?: number; newRequirementSuggestionsCreated: number; possibleChangeSuggestionsCreated: number; possibleRemovals: { itemId: string; title: string; reason: string }[] }; error?: string }> {
  try {
    const result = await appApiFetch<{
      analysisVersion?: number;
      newRequirementSuggestionsCreated: number;
      possibleChangeSuggestionsCreated: number;
      possibleRemovals: { itemId: string; title: string; reason: string }[];
    }>(`/api/v1/tenders/${tenderId}/checklist/reconcile`, { method: "POST" });
    return { result };
  } catch (error) {
    return { error: errorMessage(error) };
  }
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
    return { error: "Titre et gravité requis." };
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
    return { error: "Message et gravité requis." };
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
