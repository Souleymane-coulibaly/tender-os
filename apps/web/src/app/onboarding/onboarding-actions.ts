"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { APP_ORGANIZATION_COOKIE, APP_SESSION_COOKIE, AppApiError, appApiFetch, appApiFetchWithToken } from "../../lib/app-api-client";
import { createCheckoutSessionAction, type CheckoutTarget } from "../app/billing-actions";
import { onboardingQueryString, parseOnboardingQuery, type OnboardingQuery } from "./onboarding-query";
import { API_ERROR_MESSAGES, describeApiError } from "../../lib/api-error-messages";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

function readQueryString(formData: FormData): OnboardingQuery {
  const raw = formData.get("queryString");
  if (typeof raw !== "string" || !raw) return {};
  return parseOnboardingQuery(Object.fromEntries(new URLSearchParams(raw)));
}

/** Translittère grossièrement les accents courants avant slugification — jamais une dépendance
 *  externe pour ça, un besoin ponctuel et borné (noms d'entreprises françaises). */
function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Slug lisible + suffixe aléatoire (jamais demandé à l'utilisateur — mission "simple malgré un
 *  domaine complexe") : évite toute collision `ORGANIZATION_SLUG_ALREADY_TAKEN` sans retry. */
function slugifyOrganizationName(name: string): string {
  const base = stripDiacritics(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "organisation"}-${suffix}`;
}

export type AccountStepState = { error?: string };

/**
 * Étape "Compte" — inscription + connexion immédiate (mission : jamais un utilisateur laissé
 * déconnecté entre les deux). CGU obligatoire (mission CGU) : `RegisterBodySchema` refuse déjà
 * `termsAccepted !== true` côté serveur avec le message exact requis — ce garde-fou client
 * n'est qu'un confort, jamais l'autorité.
 */
export async function registerAccountAction(_prevState: AccountStepState, formData: FormData): Promise<AccountStepState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const displayName = formData.get("displayName");
  const termsAccepted = formData.get("termsAccepted") === "on";
  const query = readQueryString(formData);

  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || typeof displayName !== "string" || !displayName.trim()) {
    return { error: "Tous les champs sont obligatoires." };
  }
  if (!termsAccepted) {
    return { error: "Vous devez accepter les Conditions Générales d'Utilisation pour continuer." };
  }

  const registerRes = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password, displayName: displayName.trim(), termsAccepted: true }),
    cache: "no-store",
  });

  if (!registerRes.ok) {
    const body = (await registerRes.json().catch(() => null)) as { error?: { code?: string } } | null;
    if (body?.error?.code === "EMAIL_ALREADY_REGISTERED") {
      return { error: "Un compte existe déjà avec cet email. Connectez-vous plutôt." };
    }
    if (body?.error?.code === "TERMS_NOT_ACCEPTED") {
      return { error: "Vous devez accepter les Conditions Générales d'Utilisation pour continuer." };
    }
    const code = typeof body?.error?.code === "string" ? body.error.code : undefined;
    return { error: (code && API_ERROR_MESSAGES[code]) || "Impossible de créer le compte. Vérifiez les champs saisis." };
  }

  const loginRes = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
    cache: "no-store",
  });

  if (!loginRes.ok) {
    return { error: "Compte créé, mais la connexion automatique a échoué. Connectez-vous manuellement." };
  }

  const loginBody = (await loginRes.json()) as { accessToken: string; expiresAt: string };
  const cookieStore = await cookies();
  const expires = new Date(loginBody.expiresAt);
  cookieStore.set(APP_SESSION_COOKIE, loginBody.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });

  redirect(`/onboarding/entreprise${onboardingQueryString(query)}`);
}

export type OrganizationStepState = { error?: string };

/** Étape "Entreprise" — création atomique Organisation + OWNER (réutilise `POST /organizations`
 *  tel quel, jamais un second mécanisme de création). Région fixée à la France (mission : hors
 *  périmètre "onboarding multi-pays") — devise/fuseau déduits, jamais redemandés à l'utilisateur.
 *
 * Idempotence sur double soumission (audit Codex — correctif du P1 identifié : l'ancienne version
 * de cette action faisait un "lire côté frontend PUIS écrire" en DEUX appels HTTP séparés, une
 * fenêtre de course RÉELLE entre les deux — un double-clic/retry réseau concurrent pouvait créer
 * deux organisations). `reuseExistingIfPresent: true` déplace la totalité de cette décision côté
 * backend, dans UNE SEULE requête, protégée par un verrou consultatif Postgres scopé à l'acteur
 * (`CreateOrganizationWithOwnerUseCase.bootstrapUnderLock`, voir ce use case) — jamais un second
 * mécanisme d'idempotence inventé ici, uniquement un flag explicite sur l'appel déjà existant. */
export async function createOrganizationAction(_prevState: OrganizationStepState, formData: FormData): Promise<OrganizationStepState> {
  const name = formData.get("name");
  const legalName = formData.get("legalName");
  const registrationNumber = formData.get("registrationNumber");
  const query = readQueryString(formData);

  if (typeof name !== "string" || !name.trim()) {
    return { error: "Le nom de l'entreprise est obligatoire." };
  }

  let organization: { id: string };
  try {
    // Checkpoint TENDEROS-2.1-P2.2.2 — root cause runtime prouvée : c'est CET appel qui crée
    // l'organisation d'un utilisateur neuf, donc `APP_ORGANIZATION_COOKIE` n'existe structurellement
    // pas encore à ce stade (il n'est écrit qu'après, ci-dessous, en cas de succès). `appApiFetch`
    // exigeait ce cookie par défaut avant même de tenter la requête — un deadlock pour 100% des
    // nouveaux utilisateurs. `requireOrganization: false` : `POST /organizations` n'est protégé que
    // par `AuthenticatedGuard`, jamais `OrganizationMembershipGuard` (voir `app-api-client.ts`).
    organization = await appApiFetch<{ id: string }>(
      "/api/v1/organizations",
      {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          slug: slugifyOrganizationName(name.trim()),
          legalName: typeof legalName === "string" && legalName.trim() ? legalName.trim() : undefined,
          registrationNumber: typeof registrationNumber === "string" && registrationNumber.trim() ? registrationNumber.trim() : undefined,
          countryCode: "FR",
          defaultCurrency: "EUR",
          defaultTimezone: "Europe/Paris",
          reuseExistingIfPresent: true,
        }),
      },
      { requireOrganization: false },
    );
  } catch (error) {
    if (error instanceof AppApiError && error.status === 401) {
      redirect(`/onboarding/compte${onboardingQueryString(query)}`);
    }
    console.error("[TenderOS] createOrganizationAction failed:", error);
    // Jamais un message unique pour toutes les causes : un refus de l'API est dit par son code
    // (lib/api-error-messages.ts), et une API injoignable (réseau, service arrêté) n'est pas
    // présentée comme une donnée saisie refusée.
    if (error instanceof AppApiError) {
      return { error: describeApiError(error, "Impossible de créer l'organisation. Réessayez.") };
    }
    return { error: "Le service TenderOS est momentanément injoignable. Réessayez dans un instant." };
  }

  const cookieStore = await cookies();
  cookieStore.set(APP_ORGANIZATION_COOKIE, organization.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Next.js expose uniquement name/value en lecture (`RequestCookie`, jamais `expires`) — durée
    // fixe alignée sur ACCESS_TOKEN_TTL_SECONDS (identity/application/use-cases/
    // authenticate-user.use-case.ts, 1h), même motif que loginAction pour ce même cookie.
    maxAge: 60 * 60,
  });

  redirect(`/onboarding/offre${onboardingQueryString(query)}`);
}

export type CheckoutStepState = { error?: string; url?: string };

/** Étape "Paiement" — délègue entièrement à `createCheckoutSessionAction` (billing, inchangé),
 *  avec `returnTarget: "onboarding"` pour que Stripe revienne sur cette étape plutôt que sur
 *  l'écran Abonnement classique. Jamais un second appel Stripe : ni prix ni Price ID choisis ici. */
export async function startOnboardingCheckoutAction(target: CheckoutTarget): Promise<CheckoutStepState> {
  const result = await createCheckoutSessionAction(target, "onboarding");
  return result;
}

/** Sondage de l'état réel de paiement (mission : ne jamais faire confiance à l'URL de retour
 *  Stripe, uniquement à `GET /billing/subscription`/aux Pass — la seule autorité). */
export async function fetchOnboardingPaymentStatus(): Promise<{ hasPlan: boolean; subscriptionStatus?: string }> {
  try {
    const subscription = await appApiFetch<{ subscription: { status: string } | null }>("/api/v1/billing/subscription");
    if (subscription.subscription) return { hasPlan: true, subscriptionStatus: subscription.subscription.status };
  } catch {
    // ignore, on retente via les Pass ci-dessous
  }
  try {
    const passes = await appApiFetch<{ items: { status: string }[] }>("/api/v1/billing/pass-purchases?limit=1");
    return { hasPlan: passes.items.length > 0 };
  } catch {
    return { hasPlan: false };
  }
}

export type ConfigurationStepState = { error?: string };

/** Étape "Configuration initiale" — écrite dans `Organization.settings` (JSON libre déjà
 *  existant), jamais un nouveau modèle. Entièrement skippable (mission) : `skip=true` avance sans
 *  rien écrire. */
export async function completeOnboardingConfigurationAction(_prevState: ConfigurationStepState, formData: FormData): Promise<ConfigurationStepState> {
  const skip = formData.get("skip") === "true";
  const sector = formData.get("sector");
  const marketPreference = formData.get("marketPreference");

  if (!skip) {
    try {
      await appApiFetch("/api/v1/organizations/me", {
        method: "PATCH",
        body: JSON.stringify({
          settings: {
            onboardingSector: typeof sector === "string" && sector ? sector : undefined,
            onboardingMarketPreference: typeof marketPreference === "string" && marketPreference ? marketPreference : undefined,
            onboardingRegion: "France",
          },
        }),
      });
    } catch (error) {
      console.error("[TenderOS] completeOnboardingConfigurationAction failed:", error);
      return { error: "Impossible d'enregistrer ces préférences. Vous pouvez continuer, elles restent modifiables plus tard." };
    }
  }

  redirect("/onboarding/bienvenue");
}

export type OnboardingResumeState = Readonly<{
  hasSession: boolean;
  organizationId?: string;
  hasPlan: boolean;
}>;

/** Sondage de paiement scopé à un token/organisation explicites — utilisé UNIQUEMENT pendant le
 *  rendu d'une page (voir `resolveOnboardingResumeState`) : Next.js interdit d'écrire un cookie
 *  pendant un rendu (uniquement depuis une Server Action/un Route Handler), donc cette variante ne
 *  dépend jamais du cookie d'organisation, seulement du header explicite. */
async function fetchOnboardingPaymentStatusFor(token: string, organizationId: string): Promise<boolean> {
  try {
    const subscription = await appApiFetchWithToken<{ subscription: unknown }>(token, "/api/v1/billing/subscription", {
      headers: { "X-Organization-Id": organizationId },
    });
    if (subscription.subscription) return true;
  } catch {
    // on retente via les Pass ci-dessous
  }
  try {
    const passes = await appApiFetchWithToken<{ items: { status: string }[] }>(token, "/api/v1/billing/pass-purchases?limit=1", {
      headers: { "X-Organization-Id": organizationId },
    });
    return passes.items.length > 0;
  } catch {
    return false;
  }
}

/** Résout l'état réel du wizard depuis le backend — jamais un état persisté séparément (mission
 *  "ne pas créer un deuxième système d'organisation") : chaque étape redirige selon CE QUI EXISTE
 *  vraiment, pas selon une progression mémorisée côté client. Appelée pendant le rendu d'une page
 *  (jamais depuis une Server Action) — ne modifie donc jamais de cookie ici ; le cookie
 *  d'organisation est écrit UNE SEULE FOIS, par `createOrganizationAction`. */
export async function resolveOnboardingResumeState(): Promise<OnboardingResumeState> {
  const cookieStore = await cookies();
  const token = cookieStore.get(APP_SESSION_COOKIE)?.value;

  if (!token) {
    return { hasSession: false, hasPlan: false };
  }

  let organizationId: string | undefined;
  try {
    const memberships = await appApiFetchWithToken<{ items: { organization: { id: string } }[] }>(token, "/api/v1/organization-memberships/me?limit=1");
    organizationId = memberships.items[0]?.organization.id;
  } catch {
    return { hasSession: true, hasPlan: false };
  }

  if (!organizationId) {
    return { hasSession: true, hasPlan: false };
  }

  const hasPlan = await fetchOnboardingPaymentStatusFor(token, organizationId);

  return { hasSession: true, organizationId, hasPlan };
}
