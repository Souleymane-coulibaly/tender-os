/**
 * Port applicatif d'abstraction fournisseur IA (mission Sprint 4.1 §"Abstraction IA") —
 * indépendant de tout SDK fournisseur (jamais un import OpenAI/Anthropic/Mistral/Azure dans le
 * domaine ou l'application, voir `infrastructure/openai.ai-provider.ts` pour le seul adapter réel
 * de cette tranche). Les erreurs sont remontées sous forme d'erreurs de domaine normalisées (voir
 * `domain/errors.ts` — `AiTimeoutError`, `AiRateLimitedError`, etc.), jamais une erreur brute de
 * bibliothèque HTTP.
 */
export type AIProviderRequest = Readonly<{
  model: string;
  /** Instruction système DE TÂCHE uniquement — reste un texte technique minimal pour cette tranche
   *  (voir `PromptTemplatePort`), jamais un prompt métier RC/CCTP/CCAP. Consolidation IA —
   *  Checkpoint B (correctif audit P2 "séparation de rôle") : ne contient JAMAIS le System Prompt
   *  plateforme (`TENDEROS_SYSTEM_PROMPT`) — celui-ci est injecté séparément et structurellement
   *  (son propre message `{role: "system"}`, toujours en premier) par l'adapter
   *  (`infrastructure/openai.ai-provider.ts`), jamais concaténé ici par l'appelant. */
  systemPrompt: string;
  userPrompt: string;
  /** Schéma JSON attendu de la réponse (mission §"Validation de sortie") — transmis au provider
   *  quand il supporte un mode structuré ; la validation réelle reste effectuée côté application
   *  (`analysis-output.schema.ts`), jamais uniquement déléguée au provider. */
  responseSchemaName: string;
  maxOutputTokens?: number | undefined;
  temperature?: number | undefined;
  timeoutMs: number;
}>;

export type AIProviderUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}>;

export type AIProviderResult = Readonly<{
  /** Contenu brut retourné par le provider (attendu JSON) — jamais journalisé en entier (mission
   *  §"Observabilité"), validé par l'appelant avant toute confiance (mission §"Validation de
   *  sortie"). */
  content: string;
  usage: AIProviderUsage;
  durationMs: number;
  /** Identifiant de requête fournisseur si disponible (ex. `x-request-id` OpenAI) — jamais une clé
   *  API, jamais un identifiant permettant de retrouver un secret. */
  providerRequestId?: string | undefined;
}>;

export interface AIProvider {
  readonly name: string;
  complete(request: AIProviderRequest): Promise<AIProviderResult>;
}
