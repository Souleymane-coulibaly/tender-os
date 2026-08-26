
export type AnalysisConfig = Readonly<{
  /** Nom du provider configuré (ex. "OPENAI") — `undefined` si absent : ne fait JAMAIS échouer le
   *  démarrage de l'application (mission §"Configuration" — "Aucune variable obligatoire ne doit
   *  faire crasher les modules qui ne déclenchent pas d'analyse"). Résolu paresseusement par
   *  `AIProviderRegistry.resolve()`, uniquement lorsqu'une analyse démarre réellement. */
  aiProvider?: string | undefined;
  /**
   * Checkpoint TENDEROS-2.1-LEGACY-DECOMMISSIONING — `aiModel`, `aiModelForDocumentAnalysis` et
   * `aiModelForTenderConsolidation` (Sprint 4.2, "une variable d'environnement par tâche") ont été
   * retirés d'ici. Depuis le checkpoint P2.3-E4.1, `AiModelRouter` est la SEULE autorité de
   * sélection du modèle et une résolution en échec lève `AiModelRouterUnavailableError` — jamais un
   * repli sur une variable d'environnement. Les trois champs n'avaient donc plus aucun lecteur :
   * leur seul consommateur documenté, `ProcessAnalysisJobUseCase`, était déjà passé au Router.
   * Ce module ne configure plus QUE le transport (provider, timeouts, retries, clé API).
   */
  aiTimeoutMs: number;
  /**
   * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-1 (F-01, axe A) — budget PROPRE à la consolidation
   * Tender, jamais une augmentation globale de `aiTimeoutMs`.
   *
   * Mesuré sur PostgreSQL et provider réels pendant la TNR post-décommissionnement :
   *  - scope DOCUMENT : 4,2 s à 9,7 s (maximum = 32 % du budget de 30 s) — largement suffisant,
   *    ce budget reste donc inchangé ;
   *  - scope TENDER   : le provider a répondu à 16,6 s et 20,0 s sur 3 documents courts, mais a
   *    dépassé 30 s sur un corpus plus riche — 3 tentatives × 30 s ont produit deux échecs
   *    `AI_TIMEOUT` mesurés à 93,1 s et 93,2 s.
   *
   * L'écart est structurel, pas accidentel : la consolidation émet une sortie structurée bien plus
   * volumineuse (résumé + 6 tableaux porteurs de provenance) que l'analyse d'un document, et la
   * durée de génération suit le nombre de tokens produits. 120 s laissent 6× la marge de la plus
   * longue réponse réellement observée, sans jamais transformer un timeout en succès : l'issue
   * reste SUCCEEDED ou FAILED.
   */
  aiTimeoutMsForTenderConsolidation: number;
  aiMaxRetries: number;
  aiRetryDelayMs: number;
  /** Jamais journalisée, jamais exposée par aucun DTO/présenteur (mission §"Sécurité"). */
  openAiApiKey?: string | undefined;
}>;

export const ANALYSIS_CONFIG = Symbol("ANALYSIS_CONFIG");

const DEFAULT_AI_TIMEOUT_MS = 30_000;
/** Voir la justification mesuree portee par `aiTimeoutMsForTenderConsolidation`. */
const DEFAULT_AI_TIMEOUT_MS_FOR_TENDER_CONSOLIDATION = 120_000;
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
  return {
    aiProvider: env.AI_PROVIDER || undefined,
    aiTimeoutMs: readPositiveIntegerOrDefault(env, "AI_TIMEOUT_MS", DEFAULT_AI_TIMEOUT_MS),
    aiTimeoutMsForTenderConsolidation: readPositiveIntegerOrDefault(
      env,
      "AI_TIMEOUT_MS_TENDER_CONSOLIDATION",
      DEFAULT_AI_TIMEOUT_MS_FOR_TENDER_CONSOLIDATION,
    ),
    aiMaxRetries: readNonNegativeIntegerOrDefault(env, "AI_MAX_RETRIES", DEFAULT_AI_MAX_RETRIES),
    aiRetryDelayMs: readNonNegativeIntegerOrDefault(env, "AI_RETRY_DELAY_MS", DEFAULT_AI_RETRY_DELAY_MS),
    openAiApiKey: env.OPENAI_API_KEY || undefined,
  };
}
