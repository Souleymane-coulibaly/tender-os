
export type GenerationModelRate = Readonly<{
  inputPricePerMillionTokens: number;
  outputPricePerMillionTokens: number;
  currency: string;
}>;

export type GenerationConfig = Readonly<{
  /** Même discipline que `AnalysisConfig.aiProvider` — jamais obligatoire au démarrage (mission
   *  §"Configuration"), résolu paresseusement uniquement quand une génération démarre réellement. */
  aiProvider?: string | undefined;
  /** Un seul modèle par défaut, jamais une variable par type de tâche (décision A1, voir rapport
   *  final §H — le routage réel par taskType est dormant tant qu'aucune RoutingPolicy Sprint 5.2
   *  ne peut exister pour Generation). */
  /**
   * Checkpoint TENDEROS-2.1-LEGACY-DECOMMISSIONING — le champ `aiModel` (modele statique par
   * variable d'environnement) a ete retiré : depuis le checkpoint P2.3-E4, `AiModelRouter` est
   * la SEULE autorite de selection du modele et un Router indisponible echoue explicitement,
   * jamais par un repli sur cette configuration. Elle ne porte plus que le transport.
   */
  aiTimeoutMs: number;
  aiMaxRetries: number;
  aiRetryDelayMs: number;
  openAiApiKey?: string | undefined;
  /** Tarif statique informatif (mission §"coût estimé", jamais une source de facturation) — clé
   *  `"PROVIDER:modelKey"`. */
  modelRates: Readonly<Record<string, GenerationModelRate>>;
}>;

export const GENERATION_CONFIG = Symbol("GENERATION_CONFIG");

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

function readModelRates(env: NodeJS.ProcessEnv): Readonly<Record<string, GenerationModelRate>> {
  const raw = env.GENERATION_MODEL_RATES;
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("must be a JSON object");
    }
    return parsed as Record<string, GenerationModelRate>;
  } catch (error) {
    throw new Error(`Invalid environment variable GENERATION_MODEL_RATES: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Aucune variable n'est obligatoire au démarrage — même discipline que `loadAnalysisConfig`. */
export function loadGenerationConfig(env: NodeJS.ProcessEnv = process.env): GenerationConfig {
  return {
    aiProvider: env.GENERATION_AI_PROVIDER || env.AI_PROVIDER || undefined,
    aiTimeoutMs: readPositiveIntegerOrDefault(env, "GENERATION_AI_TIMEOUT_MS", DEFAULT_AI_TIMEOUT_MS),
    aiMaxRetries: readNonNegativeIntegerOrDefault(env, "GENERATION_AI_MAX_RETRIES", DEFAULT_AI_MAX_RETRIES),
    aiRetryDelayMs: readNonNegativeIntegerOrDefault(env, "GENERATION_AI_RETRY_DELAY_MS", DEFAULT_AI_RETRY_DELAY_MS),
    openAiApiKey: env.OPENAI_API_KEY || undefined,
    modelRates: readModelRates(env),
  };
}
