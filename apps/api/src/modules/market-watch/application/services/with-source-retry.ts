/**
 * Checkpoint TENDEROS-2.1-P2.3-E3, mission §27 ("prévoir retry contrôlé" pour timeout/429/panne
 * transitoire d'une source) — un SEUL helper générique, partagé par tous les connecteurs
 * (`MarketSourceConnector`), jamais une logique de retry dupliquée dans chaque connecteur (mission
 * §0 "ne pas dupliquer"). Volontairement minimal : peu de tentatives, backoff court — le worker
 * tourne déjà toutes les heures (mission §9), la vraie résilience long terme vient du prochain
 * cycle planifié, jamais d'un retry agressif qui aggraverait un vrai rate-limit source (mission
 * §27 "429"). Une source qui échoue malgré les tentatives reste isolée par le worker appelant
 * (`MarketSourceSyncWorker.tick`, try/catch par connecteur déjà en place) — jamais bloquante pour
 * les autres sources.
 */
export type SourceRetryOptions = Readonly<{ attempts?: number; delayMs?: number }>;

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_DELAY_MS = 500;

/**
 * Checkpoint TENDEROS-2.1-P2.3-E12 (P2, mission §42 "distinguer TRANSIENT / PERMANENT") — les
 * connecteurs levaient un `Error` générique dont seul le message portait le statut : impossible à
 * classifier sans parser du texte. Erreur typée minimale (jamais une hiérarchie d'erreurs
 * transport complète) portant le SEUL élément nécessaire à la décision de retry.
 */
export class MarketSourceHttpError extends Error {
  constructor(
    readonly source: string,
    readonly status: number,
  ) {
    super(`${source} API responded HTTP ${status}`);
    this.name = "MarketSourceHttpError";
  }
}

/** Mission §42 — un 4xx (payload/paramètre invalide, non autorisé) est PERMANENT : le rejouer 3 fois
 *  ne peut structurellement pas réussir et ne fait que retarder le cycle. Exceptions explicites :
 *  408 (timeout) et 429 (rate limit) sont transitoires malgré leur classe 4xx. Tout le reste
 *  (timeouts réseau, coupures, 5xx) reste retryable — comportement d'origine inchangé. */
function isPermanentFailure(error: unknown): boolean {
  if (!(error instanceof MarketSourceHttpError)) return false;
  if (error.status === 408 || error.status === 429) return false;
  return error.status >= 400 && error.status < 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withSourceRetry<T>(fn: () => Promise<T>, options?: SourceRetryOptions): Promise<T> {
  const attempts = options?.attempts ?? DEFAULT_ATTEMPTS;
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      // Mission §42 — un échec PERMANENT sort immédiatement : jamais 3 tentatives inutiles qui
      // retardent le reste du cycle sans aucune chance de succès.
      if (isPermanentFailure(error)) {
        throw error;
      }
      if (attempt < attempts) {
        // Backoff linéaire court — jamais exponentiel agressif, mission §27 "ne pas aggraver un 429".
        await sleep(delayMs * attempt);
      }
    }
  }
  throw lastError;
}
