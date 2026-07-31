/** Capacités déclarées d'un modèle (Sprint 5.2 §"Les capacités doivent être vérifiées avant
 *  affectation à une tâche") — jamais supposées, toujours explicites sur le registre. */
export type AiModelCapabilities = Readonly<{
  supportsStructuredOutput: boolean;
  supportsToolCalling: boolean;
  supportsVision: boolean;
}>;

export const DEFAULT_AI_MODEL_CAPABILITIES: AiModelCapabilities = {
  supportsStructuredOutput: false,
  supportsToolCalling: false,
  supportsVision: false,
};
