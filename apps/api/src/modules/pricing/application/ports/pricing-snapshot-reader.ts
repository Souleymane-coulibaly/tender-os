/**
 * Port PROPRE à Pricing pour lire le tarif COURANT d'un modèle (Sprint 5.2 `AiModelPricingSnapshot`)
 * — jamais un import direct des ports internes d'ai-benchmark (même motif que
 * `RoutingPolicyResolver` de Generation, Sprint 6). Implémenté par un adaptateur dans
 * `ai-benchmark/infrastructure`, lié via `RoutingPolicyBridgeModule`. Utilisé UNIQUEMENT pour la
 * prévision AVANT génération (mission §"Prévision avant génération") — jamais pour recalculer un
 * coût technique déjà figé (`GenerationCostReader` reste l'unique source pour l'historique).
 */
export type CurrentModelPricing = Readonly<{
  aiModelId: string;
  provider: string;
  modelKey: string;
  inputPricePerMillionTokens: string;
  outputPricePerMillionTokens: string;
  currency: string;
  effectiveFrom: Date;
}>;

export interface PricingSnapshotReader {
  /** `null` si aucun tarif courant n'existe pour ce modèle — jamais un tarif inventé. */
  findCurrentForModel(input: { aiModelId: string }): Promise<CurrentModelPricing | null>;
}

export const PRICING_SNAPSHOT_READER = Symbol("PRICING_SNAPSHOT_READER");
