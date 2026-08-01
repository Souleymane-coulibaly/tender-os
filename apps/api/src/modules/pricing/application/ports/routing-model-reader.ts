/**
 * Port PROPRE à Pricing pour résoudre le modèle qu'une RoutingPolicy Sprint 5.2 ACTIVE routerait
 * pour un `taskType` donné — utilisé UNIQUEMENT par `PreviewGenerationCostUseCase` pour savoir
 * QUEL tarif lire (voir `PricingSnapshotReader`). Jamais un import du port `RoutingPolicyResolver`
 * de Generation (dépendance non justifiée) : structurellement proche mais un port distinct, propre
 * à ce module, même motif que chaque autre pont déjà établi vers ai-benchmark.
 */
export type RoutedModel = Readonly<{
  aiModelId: string;
  provider: string;
  modelKey: string;
  policyId: string;
  policyVersion: number;
}>;

export interface RoutingModelReader {
  /** `null` si aucune RoutingPolicy active n'existe pour ce taskType — jamais un modèle par défaut
   *  fabriqué (même discipline que `NoActiveRoutingPolicyError`, Sprint 6 réaudit). */
  resolveActiveModel(input: { organizationId: string; taskType: string }): Promise<RoutedModel | null>;
}

export const ROUTING_MODEL_READER = Symbol("PRICING_ROUTING_MODEL_READER");
