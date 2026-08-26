/**
 * Checkpoint TENDEROS-2.1-POST-DECOM-TNR-FIX-2 (F-03) — contrat de PARAMÈTRE HTTP d'OpenAI pour la
 * borne de sortie, résolu par `modelKey`.
 *
 * Pourquoi ici et pas ailleurs :
 *  - ce n'est PAS une capacité métier (`AiModelCapabilities` porte `supportsStructuredOutput` /
 *    `supportsToolCalling` / `supportsVision`, renseignées par l'administrateur sur chaque ligne du
 *    registre) : c'est le nom d'un champ dans le corps HTTP d'un fournisseur précis ;
 *  - ce n'est PAS une affaire de use case : `SendMessageUseCase` et
 *    `GenerateTechnicalMemoSectionUseCase` expriment une intention (`maxOutputTokens: N`) et ne
 *    doivent jamais connaître le vocabulaire d'OpenAI (mission §4) ;
 *  - c'est donc à l'adaptateur OpenAI, et à lui seul, de traduire cette intention.
 *
 * Les deux contrats coexistent RÉELLEMENT dans TenderOS, d'où une table explicite plutôt qu'un
 * renommage global :
 *  - `AI_ROUTING_MODEL_CATALOG` (checkpoint P2.3-E4, autorité live) : `gpt-5.4-mini`/`gpt-5.4-nano`,
 *    qui REFUSENT `max_tokens` (HTTP 400 « Use 'max_completion_tokens' instead ») ;
 *  - `ALLOWED_MODEL_CATALOG` (registre ai-benchmark, atteignable via une `RoutingPolicy` active) :
 *    `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini`, qui attendent `max_tokens`, et `o3-mini`
 *    (modèle de raisonnement) qui attend `max_completion_tokens`.
 *
 * Corriger `gpt-5.4-*` en renommant le champ partout aurait donc cassé la famille `gpt-4*`.
 */
export type OpenAiMaxOutputTokensParameter = "max_tokens" | "max_completion_tokens";

/**
 * Le défaut vaut pour tout `modelKey` non listé. `max_completion_tokens` est le contrat vers lequel
 * OpenAI converge (familles de raisonnement et gpt-5+) : un modèle ajouté demain hérite du contrat
 * moderne plutôt que d'un contrat en voie de retrait. Tous les modèles aujourd'hui ATTEIGNABLES
 * sont explicitement listés ci-dessous — ce défaut ne couvre donc aucun cas courant.
 */
const DEFAULT_PARAMETER: OpenAiMaxOutputTokensParameter = "max_completion_tokens";

const PARAMETER_BY_MODEL_KEY: Readonly<Record<string, OpenAiMaxOutputTokensParameter>> = {
  // Registre ai-benchmark — contrat historique.
  "gpt-4o": "max_tokens",
  "gpt-4o-mini": "max_tokens",
  "gpt-4.1": "max_tokens",
  "gpt-4.1-mini": "max_tokens",
  // Modèle de raisonnement : refuse `max_tokens` comme les familles gpt-5+.
  "o3-mini": "max_completion_tokens",
  // Catalogue de routage live (P2.3-E4).
  "gpt-5.4-mini": "max_completion_tokens",
  "gpt-5.4-nano": "max_completion_tokens",
};

/** Nom du paramètre HTTP borne-de-sortie attendu par CE modèle. */
export function maxOutputTokensParameterFor(modelKey: string): OpenAiMaxOutputTokensParameter {
  return PARAMETER_BY_MODEL_KEY[modelKey.trim().toLowerCase()] ?? DEFAULT_PARAMETER;
}

/**
 * Fragment de corps de requête à fusionner — vide quand l'appelant n'exprime aucune borne, afin de
 * ne jamais envoyer un champ que le modèle n'a pas demandé.
 */
export function buildMaxOutputTokensBody(modelKey: string, maxOutputTokens: number | undefined): Record<string, number> {
  if (!maxOutputTokens) return {};
  return { [maxOutputTokensParameterFor(modelKey)]: maxOutputTokens };
}
