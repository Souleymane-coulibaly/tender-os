export type AnalysisConfig = Readonly<{
  /** Nom du provider configuré (ex. "OPENAI") — `undefined` si absent : ne fait JAMAIS échouer le
   *  démarrage de l'application (mission §"Configuration" — "Aucune variable obligatoire ne doit
   *  faire crasher les modules qui ne déclenchent pas d'analyse"). Résolu paresseusement par
   *  `AIProviderRegistry.resolve()`, uniquement lorsqu'une analyse démarre réellement. */
  aiProvider?: string | undefined;
  aiModel: string;
  /** Mission Sprint 4.2 §"Pas de modèle codé en dur dans le domaine" — configuration PAR TYPE DE
   *  TÂCHE (stratégie volontairement simple : une variable d'environnement par tâche, retombant sur
   *  `aiModel` si absente), jamais un moteur d'arbitrage complexe. Consommée uniquement par
   *  `ProcessAnalysisJobUseCase` (jamais par le domaine — `AnalysisJob` ne connaît aucun nom de
   *  modèle avant que le provider n'ait répondu). */
  aiModelForDocumentAnalysis: string;
  aiModelForTenderConsolidation: string;
  aiTimeoutMs: number;
  aiMaxRetries: number;
  aiRetryDelayMs: number;
  /** Jamais journalisée, jamais exposée par aucun DTO/présenteur (mission §"Sécurité"). */
  openAiApiKey?: string | undefined;
}>;

export const ANALYSIS_CONFIG = Symbol("ANALYSIS_CONFIG");

const DEFAULT_AI_MODEL = "gpt-4o-mini";
const DEFAULT_AI_TIMEOUT_MS = 30_000;
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

/**
 * Mission §"Configuration" — contrairement à `loadExtractionConfig` (module Extraction, toutes les
 * variables sont requises au démarrage), AUCUNE variable de cette configuration n'est obligatoire :
 * TenderOS doit pouvoir démarrer sans la moindre clé IA configurée. Une valeur PRÉSENTE mais
 * invalide (non numérique, négative) échoue quand même explicitement — jamais une valeur
 * silencieusement ignorée.
 */
export function loadAnalysisConfig(env: NodeJS.ProcessEnv = process.env): AnalysisConfig {
  const aiModel = env.AI_MODEL || DEFAULT_AI_MODEL;
  return {
    aiProvider: env.AI_PROVIDER || undefined,
    aiModel,
    aiModelForDocumentAnalysis: env.AI_MODEL_DOCUMENT_ANALYSIS || aiModel,
    aiModelForTenderConsolidation: env.AI_MODEL_TENDER_CONSOLIDATION || aiModel,
    aiTimeoutMs: readPositiveIntegerOrDefault(env, "AI_TIMEOUT_MS", DEFAULT_AI_TIMEOUT_MS),
    aiMaxRetries: readNonNegativeIntegerOrDefault(env, "AI_MAX_RETRIES", DEFAULT_AI_MAX_RETRIES),
    aiRetryDelayMs: readNonNegativeIntegerOrDefault(env, "AI_RETRY_DELAY_MS", DEFAULT_AI_RETRY_DELAY_MS),
    openAiApiKey: env.OPENAI_API_KEY || undefined,
  };
}
