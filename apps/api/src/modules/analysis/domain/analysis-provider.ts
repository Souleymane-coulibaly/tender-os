/**
 * Fournisseurs IA connus (mission Sprint 4.1) — cette liste ne garantit PAS qu'un adapter réel
 * existe pour chaque valeur : seul `OPENAI` est câblé pour cette tranche (voir
 * `infrastructure/openai.ai-provider.ts`, `AIProviderRegistry`). Les autres valeurs sont acceptées
 * par la configuration mais rejetées par le registry (`AiProviderNotConfiguredError`) tant
 * qu'aucun adapter n'est enregistré — préparation Sprint 4.2+, jamais quatre adapters complets
 * dans cette tranche.
 */
export const AnalysisProvider = {
  OpenAi: "OPENAI",
  Anthropic: "ANTHROPIC",
  Mistral: "MISTRAL",
  AzureOpenAi: "AZURE_OPENAI",
} as const;

export type AnalysisProvider = (typeof AnalysisProvider)[keyof typeof AnalysisProvider];

export function isAnalysisProvider(value: string): value is AnalysisProvider {
  return Object.values(AnalysisProvider).includes(value as AnalysisProvider);
}
