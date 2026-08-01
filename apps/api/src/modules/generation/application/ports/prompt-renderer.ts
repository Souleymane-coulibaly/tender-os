import type { PromptVersion } from "../../domain/prompt-version.entity";

export type RenderedPrompt = Readonly<{ systemPrompt: string; userPrompt: string }>;

/**
 * Rend un `PromptVersion` avec des variables connues — remplace UNIQUEMENT des placeholders
 * `{{nom}}` reconnus, rejette un placeholder non résolu (jamais un gap silencieux), ne concatène
 * jamais aveuglément un contexte non borné (la construction/troncature du contexte est la
 * responsabilité de `generation-context-builder.ts`, en amont).
 */
export interface PromptRenderer {
  render(version: PromptVersion, variables: Readonly<Record<string, string>>): RenderedPrompt;
}

export const PROMPT_RENDERER = Symbol("GENERATION_PROMPT_RENDERER");
