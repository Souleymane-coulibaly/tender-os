/**
 * Checkpoint TENDEROS-2.1-P2.3-E4 — catalogue FERMÉ des deux seuls modèles sélectionnables par ce
 * routeur (mission §4/§20). Volontairement distinct de `ai-benchmark/domain/allowed-model-catalog.ts`
 * (registre N-provider × N-modèle, admin-configuré, benchmark-driven) : E4 n'étend pas ce registre
 * générique, il ajoute une seconde AUTORITÉ, plus étroite, au-dessus (voir `ai-model-router.ts` pour
 * la précédence complète — une `RoutingPolicy` active garde priorité, inchangée, exactement comme
 * avant ce checkpoint). OpenAI reste l'unique provider (mission §1/§41).
 */
export const AiRoutingModel = {
  Gpt54Mini: "GPT_5_4_MINI",
  Gpt54Nano: "GPT_5_4_NANO",
} as const;

export type AiRoutingModel = (typeof AiRoutingModel)[keyof typeof AiRoutingModel];

export function isAiRoutingModel(value: string): value is AiRoutingModel {
  return value === AiRoutingModel.Gpt54Mini || value === AiRoutingModel.Gpt54Nano;
}

export type AiRoutingModelCatalogEntry = Readonly<{
  provider: "OPENAI";
  modelKey: string;
  displayName: string;
  /** UX mission §17 — jamais de détails techniques, une seule phrase orientée usage. */
  description: string;
}>;

export const AI_ROUTING_MODEL_CATALOG: Record<AiRoutingModel, AiRoutingModelCatalogEntry> = {
  [AiRoutingModel.Gpt54Mini]: {
    provider: "OPENAI",
    modelKey: "gpt-5.4-mini",
    displayName: "GPT-5.4 mini",
    description: "Plus avancé — adapté aux analyses, raisonnements et rédactions.",
  },
  [AiRoutingModel.Gpt54Nano]: {
    provider: "OPENAI",
    modelKey: "gpt-5.4-nano",
    displayName: "GPT-5.4 nano",
    description: "Rapide et économique — adapté aux extractions et tâches simples.",
  },
};
