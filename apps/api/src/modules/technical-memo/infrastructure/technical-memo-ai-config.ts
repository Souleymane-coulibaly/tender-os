
/** Config locale au module `technical-memo` (même motif que `ChatConfig`/`GenerationConfig`) —
 *  `AI_PROVIDER_REGISTRY` reste partagé (résout la clé API via `AnalysisConfig.openAiApiKey`) : ce
 *  fichier ne porte jamais de secret, uniquement les paramètres de modèle/timeout propres à ce
 *  module. */
export type TechnicalMemoAiConfig = Readonly<{
  aiProvider?: string | undefined;
  /**
   * Checkpoint TENDEROS-2.1-LEGACY-DECOMMISSIONING — le champ `aiModel` (modele statique par
   * variable d'environnement) a ete retiré : depuis le checkpoint P2.3-E4, `AiModelRouter` est
   * la SEULE autorite de selection du modele et un Router indisponible echoue explicitement,
   * jamais par un repli sur cette configuration. Elle ne porte plus que le transport.
   */
  aiTimeoutMs: number;
  aiMaxRetries: number;
  aiRetryDelayMs: number;
}>;

export const TECHNICAL_MEMO_AI_CONFIG = Symbol("TECHNICAL_MEMO_AI_CONFIG");

const DEFAULT_AI_TIMEOUT_MS = 60_000;
const DEFAULT_AI_MAX_RETRIES = 2;
const DEFAULT_AI_RETRY_DELAY_MS = 1_000;

function readPositiveIntegerOrDefault(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid environment variable ${name}: "${raw}" must be a positive integer.`);
  }
  return value;
}

function readNonNegativeIntegerOrDefault(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid environment variable ${name}: "${raw}" must be a non-negative integer.`);
  }
  return value;
}

/** Aucune variable n'est obligatoire au démarrage — même discipline que `loadChatConfig`. */
export function loadTechnicalMemoAiConfig(env: NodeJS.ProcessEnv = process.env): TechnicalMemoAiConfig {
  return {
    aiProvider: env.TECHNICAL_MEMO_AI_PROVIDER || env.AI_PROVIDER || undefined,
    aiTimeoutMs: readPositiveIntegerOrDefault(env, "TECHNICAL_MEMO_AI_TIMEOUT_MS", DEFAULT_AI_TIMEOUT_MS),
    aiMaxRetries: readNonNegativeIntegerOrDefault(env, "TECHNICAL_MEMO_AI_MAX_RETRIES", DEFAULT_AI_MAX_RETRIES),
    aiRetryDelayMs: readNonNegativeIntegerOrDefault(env, "TECHNICAL_MEMO_AI_RETRY_DELAY_MS", DEFAULT_AI_RETRY_DELAY_MS),
  };
}
