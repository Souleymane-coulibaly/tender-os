import { AnalysisProvider } from "../../analysis";

/**
 * Liste blanche des couples (provider, modelKey) que le registre peut accepter (Sprint 5.2
 * §"Le client HTTP ne peut pas injecter un nom de modèle arbitraire" + §"Ne code pas en dur une
 * liste considérée comme éternelle"). Ce n'est PAS la liste des modèles réellement utilisables en
 * production — seulement la liste des identifiants qu'un administrateur a le droit de proposer au
 * registre (`RegisterAiModelUseCase`). Un modèle absent d'ici est rejeté avant toute écriture, quel
 * que soit le rôle de l'acteur.
 *
 * Volontairement une simple constante TypeScript (pas une table Prisma) : contrairement au
 * catalogue de tarifs (qui évolue vraiment et doit être versionné, voir `AiModelPricingSnapshot`),
 * l'apparition d'un nouveau modelKey chez un fournisseur est un événement de déploiement — ajouter
 * une ligne ici fait partie du même processus de revue de code que n'importe quelle autre
 * évolution de contrat, jamais une action à chaud depuis le frontend.
 */
export const ALLOWED_MODEL_CATALOG: Readonly<Record<string, readonly string[]>> = {
  // gpt-5.4-mini / gpt-5.4-nano : les seuls modèles réellement appelés (`AiModelRouter`,
  // `AI_ROUTING_MODEL_CATALOG`). Absents d'ici, ils ne pouvaient ni être enregistrés ni tarifés :
  // aucun coût IA (prévision ou réel) n'était calculable pour le modèle vraiment utilisé.
  [AnalysisProvider.OpenAi]: ["gpt-5.4-mini", "gpt-5.4-nano", "gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o3-mini"],
  // ANTHROPIC / MISTRAL / AZURE_OPENAI : acceptés par la forme du registre (voir AiModel.provider)
  // pour ne pas devoir modifier le schéma le jour où un adapter réel existe, mais aucune entrée
  // n'est autorisée tant qu'aucun AIProvider concret n'est câblé (Sprint 5.2 §"Ne crée pas de faux
  // support multi-provider") — DefaultAIProviderRegistry rejette de toute façon ces providers.
  [AnalysisProvider.Anthropic]: [],
  [AnalysisProvider.Mistral]: [],
  [AnalysisProvider.AzureOpenAi]: [],
};

export function isModelKeyAllowed(provider: string, modelKey: string): boolean {
  return (ALLOWED_MODEL_CATALOG[provider] ?? []).includes(modelKey);
}

export function listAllowedModelKeys(provider: string): readonly string[] {
  return ALLOWED_MODEL_CATALOG[provider] ?? [];
}
