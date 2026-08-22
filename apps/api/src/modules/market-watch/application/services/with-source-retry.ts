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
      if (attempt < attempts) {
        // Backoff linéaire court — jamais exponentiel agressif, mission §27 "ne pas aggraver un 429".
        await sleep(delayMs * attempt);
      }
    }
  }
  throw lastError;
}
