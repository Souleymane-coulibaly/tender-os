import { z } from "zod";
import { integrationRequestsFailed } from "../../../shared-kernel/metrics/metrics";
import { ProviderErrorCode } from "../domain/enums";
import { RemoteProviderError } from "../domain/errors";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;
/** Mission §20 — aucun appel externe ne doit rester suspendu indéfiniment : même un `Retry-After`
 *  provider plus long que ceci n'est jamais honoré littéralement à l'intérieur d'une requête HTTP
 *  synchrone TenderOS (il n'existe aucune file de jobs, mission §28/§35 "sync manuelle reste
 *  acceptable") — au-delà, on abandonne immédiatement avec une erreur RATE_LIMITED retryable,
 *  jamais un blocage silencieux du navigateur de l'utilisateur. */
const MAX_HONORED_DELAY_MS = 5_000;

function classifyStatus(status: number): ProviderErrorCode {
  if (status === 401) return ProviderErrorCode.AuthError;
  if (status === 403) return ProviderErrorCode.PermissionDenied;
  if (status === 404) return ProviderErrorCode.NotFound;
  if (status === 409) return ProviderErrorCode.Conflict;
  if (status === 429) return ProviderErrorCode.RateLimited;
  if (status === 400 || status === 422) return ProviderErrorCode.InvalidRequest;
  if (status >= 500) return ProviderErrorCode.ProviderUnavailable;
  return ProviderErrorCode.Unknown;
}

/** Mission §23 — jamais de retry automatique sur une erreur permanente (auth/permission/not-found/
 *  conflict/invalid request) : seules RATE_LIMITED/PROVIDER_UNAVAILABLE/TIMEOUT sont transitoires. */
function isRetryable(code: ProviderErrorCode): boolean {
  return code === ProviderErrorCode.RateLimited || code === ProviderErrorCode.ProviderUnavailable || code === ProviderErrorCode.Timeout;
}

/** Mission §18 — `Retry-After` en secondes ou en date HTTP. */
function parseRetryAfterSeconds(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    const diffMs = date - Date.now();
    return diffMs > 0 ? Math.ceil(diffMs / 1000) : 0;
  }
  return undefined;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelayMs(attempt: number, retryAfterSeconds: number | undefined): number {
  if (retryAfterSeconds !== undefined) {
    return Math.min(retryAfterSeconds * 1000, MAX_HONORED_DELAY_MS);
  }
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_HONORED_DELAY_MS);
}

/**
 * Mission §13/§18/§19/§21/§22/§70 — point d'appel HTTP UNIQUE partagé par les deux adapters
 * (jamais "Microsoft retry maison" + "Google retry maison" avec des comportements incompatibles,
 * mission §21). Timeout borné (mission §20), retry borné à `MAX_ATTEMPTS` uniquement pour les
 * codes transitoires (mission §23), `Retry-After` honoré dans une limite raisonnable (mission §18/
 * §89). Le corps de réponse brut du provider n'est JAMAIS inclus dans le message d'erreur public —
 * seulement dans `technicalDetail`, jamais sérialisé côté HTTP (mission §84/§101).
 *
 * Correctif audit Codex (P1-004) — `retryAmbiguous` (défaut `true`, sûr pour toute opération de
 * LECTURE — navigation/download/fetchAccountInfo/refresh) DOIT être mis à `false` par l'appelant
 * pour toute opération d'ÉCRITURE NON IDEMPOTENTE côté provider (`uploadFile`,
 * `createCalendarEvent`) : sans quoi CE client retenterait lui-même en interne un POST ayant
 * potentiellement déjà atteint/créé une ressource côté provider avant même que le mécanisme de
 * réservation applicatif (`NEEDS_RECONCILIATION`, voir `ExportDocumentVersionUseCase`) n'ait la
 * moindre chance de réagir — la réconciliation applicative seule ne suffit pas si CE client a déjà
 * dupliqué la requête avant de rendre la main.
 */
export async function callProviderJson<T>(url: string, schema: z.ZodType<T>, init: RequestInit, providerLabel: string, options: { retryAmbiguous?: boolean } = {}): Promise<T> {
  try {
    return await attemptCallProviderJson(url, schema, init, providerLabel, options);
  } catch (error) {
    // Sprint 21 (hardening) — mission §57 (integration_requests_failed) : un seul point
    // d'incrémentation englobant TOUTES les tentatives/retries de cet appel logique, jamais un
    // compteur par tentative interne (fausserait le signal "combien d'appels métier ont échoué").
    integrationRequestsFailed.inc({ provider: providerLabel });
    throw error;
  }
}

async function attemptCallProviderJson<T>(url: string, schema: z.ZodType<T>, init: RequestInit, providerLabel: string, options: { retryAmbiguous?: boolean } = {}): Promise<T> {
  const retryAmbiguous = options.retryAmbiguous ?? true;
  let lastError: RemoteProviderError | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      let response: Response;
      try {
        response = await fetch(url, { ...init, signal: controller.signal });
      } catch (error) {
        const code = error instanceof Error && error.name === "AbortError" ? ProviderErrorCode.Timeout : ProviderErrorCode.ProviderUnavailable;
        // Correctif audit Codex (P1-003) — aucune réponse HTTP jamais reçue ici : la requête a
        // PEUT-ÊTRE atteint le provider et été traitée malgré l'échec local (timeout/connexion
        // perdue) — jamais une simple erreur "safe to retry" pour un appelant idempotence-sensible
        // (ex. export). Distinct des erreurs dérivées d'un statut HTTP réellement reçu ci-dessous.
        const ambiguousError = new RemoteProviderError({ providerErrorCode: code, retryable: true, technicalDetail: `${providerLabel}: ${error instanceof Error ? error.message : String(error)}`, isAmbiguousOutcome: true });
        // Correctif audit Codex (P1-004) — pour une opération non idempotente, jamais de retry
        // interne sur un échec ambigu : la PREMIÈRE tentative a peut-être déjà atteint le provider,
        // une seconde tentative automatique ici dupliquerait potentiellement AVANT même que
        // l'appelant ne voie l'erreur.
        if (!retryAmbiguous) {
          throw ambiguousError;
        }
        lastError = ambiguousError;
        if (attempt < MAX_ATTEMPTS) {
          await sleep(backoffDelayMs(attempt, undefined));
          continue;
        }
        throw lastError;
      }

      if (response.ok) {
        const json: unknown = await response.json();
        return schema.parse(json);
      }

      const providerErrorCode = classifyStatus(response.status);
      const retryAfterSeconds = providerErrorCode === ProviderErrorCode.RateLimited ? parseRetryAfterSeconds(response.headers.get("retry-after")) : undefined;
      const bodyText = await response.text().catch(() => "");
      const error = new RemoteProviderError({
        providerErrorCode,
        retryable: isRetryable(providerErrorCode),
        retryAfterSeconds,
        technicalDetail: `${providerLabel}: HTTP ${response.status} — ${bodyText.slice(0, 300)}`,
      });

      if (error.retryable && attempt < MAX_ATTEMPTS) {
        lastError = error;
        await sleep(backoffDelayMs(attempt, retryAfterSeconds));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Inatteignable en pratique (chaque branche de la boucle lève avant la fin de MAX_ATTEMPTS
  // itérations) — seulement pour satisfaire le contrôle de flux TypeScript.
  throw lastError ?? new RemoteProviderError({ providerErrorCode: ProviderErrorCode.Unknown, retryable: false });
}

/** Même politique de retry/timeout/classification que `callProviderJson`, pour un téléchargement
 *  binaire (contenu de fichier) plutôt qu'une réponse JSON. Voir son commentaire pour
 *  `retryAmbiguous` (correctif audit Codex P1-004). */
export async function callProviderBinary(url: string, init: RequestInit, providerLabel: string, options: { retryAmbiguous?: boolean } = {}): Promise<Buffer> {
  try {
    return await attemptCallProviderBinary(url, init, providerLabel, options);
  } catch (error) {
    integrationRequestsFailed.inc({ provider: providerLabel });
    throw error;
  }
}

async function attemptCallProviderBinary(url: string, init: RequestInit, providerLabel: string, options: { retryAmbiguous?: boolean } = {}): Promise<Buffer> {
  const retryAmbiguous = options.retryAmbiguous ?? true;
  let lastError: RemoteProviderError | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      let response: Response;
      try {
        response = await fetch(url, { ...init, signal: controller.signal });
      } catch (error) {
        const code = error instanceof Error && error.name === "AbortError" ? ProviderErrorCode.Timeout : ProviderErrorCode.ProviderUnavailable;
        // Correctif audit Codex (P1-003) — aucune réponse HTTP jamais reçue ici : la requête a
        // PEUT-ÊTRE atteint le provider et été traitée malgré l'échec local (timeout/connexion
        // perdue) — jamais une simple erreur "safe to retry" pour un appelant idempotence-sensible
        // (ex. export). Distinct des erreurs dérivées d'un statut HTTP réellement reçu ci-dessous.
        const ambiguousError = new RemoteProviderError({ providerErrorCode: code, retryable: true, technicalDetail: `${providerLabel}: ${error instanceof Error ? error.message : String(error)}`, isAmbiguousOutcome: true });
        // Correctif audit Codex (P1-004) — jamais de retry interne sur un échec ambigu pour une
        // opération non idempotente (voir `callProviderJson`).
        if (!retryAmbiguous) {
          throw ambiguousError;
        }
        lastError = ambiguousError;
        if (attempt < MAX_ATTEMPTS) {
          await sleep(backoffDelayMs(attempt, undefined));
          continue;
        }
        throw lastError;
      }

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }

      const providerErrorCode = classifyStatus(response.status);
      const retryAfterSeconds = providerErrorCode === ProviderErrorCode.RateLimited ? parseRetryAfterSeconds(response.headers.get("retry-after")) : undefined;
      const bodyText = await response.text().catch(() => "");
      const error = new RemoteProviderError({
        providerErrorCode,
        retryable: isRetryable(providerErrorCode),
        retryAfterSeconds,
        technicalDetail: `${providerLabel}: HTTP ${response.status} — ${bodyText.slice(0, 300)}`,
      });

      if (error.retryable && attempt < MAX_ATTEMPTS) {
        lastError = error;
        await sleep(backoffDelayMs(attempt, retryAfterSeconds));
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new RemoteProviderError({ providerErrorCode: ProviderErrorCode.Unknown, retryable: false });
}
