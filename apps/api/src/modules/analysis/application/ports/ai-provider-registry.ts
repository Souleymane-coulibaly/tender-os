import type { AIProvider } from "./ai-provider";

export type AIProviderSelector = Readonly<{ provider: string }>;

/**
 * Résolution du provider IA configuré (mission Sprint 4.1 §"Factory et résolution") — sélectionne
 * le provider configuré, refuse un provider inconnu/non enregistré (`AiProviderNotConfiguredError`,
 * jamais une exception non normalisée), n'expose jamais de secret. Résolu PARESSEUSEMENT (à
 * l'exécution d'une analyse, jamais au démarrage de l'application) : l'absence de configuration IA
 * ne doit jamais empêcher TenderOS de démarrer (mission §"Configuration").
 *
 * `selector` est additif (Sprint 5.2 §"Intégration seam") — `resolve()` sans argument reste
 * strictement identique au comportement Sprint 4.1/4.2 (résout le provider configuré via
 * `AnalysisConfig`) ; `resolve({ provider })` permet au module ai-benchmark de résoudre un
 * provider précis par modèle lors d'un benchmark comparant plusieurs providers, sans dupliquer la
 * logique de résolution.
 */
export interface AIProviderRegistry {
  resolve(selector?: AIProviderSelector): AIProvider;
}

export const AI_PROVIDER_REGISTRY = Symbol("AI_PROVIDER_REGISTRY");
