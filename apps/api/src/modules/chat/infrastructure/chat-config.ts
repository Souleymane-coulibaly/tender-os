
/** Config locale au module Chat (même motif que `GenerationConfig`) — `AI_PROVIDER_REGISTRY` reste
 *  partagé (résout la clé API via `AnalysisConfig.openAiApiKey`, voir `AnalysisModule`) : ce fichier
 *  ne porte jamais de secret, uniquement les paramètres de modèle/timeout propres au Chat. */
export type ChatConfig = Readonly<{
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
  /** Correctif audit Codex P1 (garde-fou volume IA, décision utilisateur) — nombre maximal de
   *  messages ASSISTANT facturables (voir `MessageRepository.countBillableAssistantMessagesForTenderSince`)
   *  autorisés par Tender sur une fenêtre glissante de 24h. Valeur par défaut volontairement
   *  généreuse (jamais un système de quota commercial/billing — décision explicite) : un simple
   *  garde-fou contre une consommation IA incontrôlée, jamais une limite métier par plan.
   */
  maxAiCallsPerTenderPerDay: number;
}>;

export const CHAT_CONFIG = Symbol("CHAT_CONFIG");

const DEFAULT_AI_TIMEOUT_MS = 60_000;
const DEFAULT_AI_MAX_RETRIES = 2;
const DEFAULT_AI_RETRY_DELAY_MS = 1_000;
const DEFAULT_MAX_AI_CALLS_PER_TENDER_PER_DAY = 100;

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

/** Aucune variable n'est obligatoire au démarrage — même discipline que `loadAnalysisConfig`/
 *  `loadGenerationConfig`. */
export function loadChatConfig(env: NodeJS.ProcessEnv = process.env): ChatConfig {
  return {
    aiProvider: env.CHAT_AI_PROVIDER || env.AI_PROVIDER || undefined,
    aiTimeoutMs: readPositiveIntegerOrDefault(env, "CHAT_AI_TIMEOUT_MS", DEFAULT_AI_TIMEOUT_MS),
    aiMaxRetries: readNonNegativeIntegerOrDefault(env, "CHAT_AI_MAX_RETRIES", DEFAULT_AI_MAX_RETRIES),
    aiRetryDelayMs: readNonNegativeIntegerOrDefault(env, "CHAT_AI_RETRY_DELAY_MS", DEFAULT_AI_RETRY_DELAY_MS),
    maxAiCallsPerTenderPerDay: readPositiveIntegerOrDefault(env, "CHAT_MAX_AI_CALLS_PER_TENDER_PER_DAY", DEFAULT_MAX_AI_CALLS_PER_TENDER_PER_DAY),
  };
}
