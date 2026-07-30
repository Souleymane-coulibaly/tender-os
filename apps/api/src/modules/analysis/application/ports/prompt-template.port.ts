/**
 * Abstraction minimale de gestion de prompts (mission Sprint 4.1 §"Prompts") — préparée pour le
 * futur Prompt Management complet (Sprint 6), volontairement statique/applicative pour cette
 * tranche : aucun écran d'administration, aucune édition dynamique, aucune table dédiée. Ne porte
 * AUCUN prompt métier d'analyse RC/CCTP/CCAP/AE (hors périmètre formel de ce Sprint).
 */
export const PromptKey = {
  /** Seul prompt de cette tranche — purement technique, valide le pipeline de bout en bout
   *  (mission §"le résultat peut rester volontairement technique"), jamais une analyse métier. */
  TechnicalValidationPlaceholder: "TECHNICAL_VALIDATION_PLACEHOLDER",
} as const;

export type PromptKey = (typeof PromptKey)[keyof typeof PromptKey];

export type PromptVersion = number;

/** Version courante de l'unique prompt technique de cette tranche — source de vérité unique,
 *  utilisée à la fois par `AnalysisJob.create` (capturée dès la création, avant tout rendu) et par
 *  `PromptTemplatePort.render` (mission §"Versionnement" — jamais deux sources divergentes). */
export const CURRENT_PROMPT_VERSION: PromptVersion = 1;

export type PromptVariables = Readonly<Record<string, string>>;

export type RenderedPrompt = Readonly<{
  version: PromptVersion;
  systemPrompt: string;
  userPrompt: string;
}>;

export interface PromptTemplatePort {
  render(key: PromptKey, variables: PromptVariables): RenderedPrompt;
}

export const PROMPT_TEMPLATE = Symbol("PROMPT_TEMPLATE");
