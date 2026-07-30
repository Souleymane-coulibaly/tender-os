import type { AIProvider } from "./ai-provider";

/**
 * Résolution du provider IA configuré (mission Sprint 4.1 §"Factory et résolution") — sélectionne
 * le provider configuré, refuse un provider inconnu/non enregistré (`AiProviderNotConfiguredError`,
 * jamais une exception non normalisée), n'expose jamais de secret. Résolu PARESSEUSEMENT (à
 * l'exécution d'une analyse, jamais au démarrage de l'application) : l'absence de configuration IA
 * ne doit jamais empêcher TenderOS de démarrer (mission §"Configuration").
 */
export interface AIProviderRegistry {
  resolve(): AIProvider;
}

export const AI_PROVIDER_REGISTRY = Symbol("AI_PROVIDER_REGISTRY");
