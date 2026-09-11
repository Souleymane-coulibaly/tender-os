/**
 * Port PROPRE à Pricing : quel modèle serait RÉELLEMENT utilisé pour un `taskType` — utilisé par
 * les prévisions de coût (aperçu, estimation, recalcul) pour savoir QUEL tarif lire (voir
 * `PricingSnapshotReader`). Implémenté par `AiRouterRoutingModelReader` (ai-benchmark), qui passe
 * par le même `AiModelRouter` que les pipelines IA au moment de l'appel — jamais une RoutingPolicy,
 * retirée du chemin runtime (une estimation lue sur une politique inactive chiffrait un modèle qui
 * n'était pas celui réellement appelé).
 */
export type RoutedModel = Readonly<{
  provider: string;
  modelKey: string;
  /** Modèle du registre (Configuration IA → Modèles) qui porte le tarif. Absent si ce modèle n'y est
   *  pas enregistré : le coût reste alors « non disponible », jamais le tarif d'un autre modèle. */
  aiModelId?: string | undefined;
}>;

export interface RoutingModelReader {
  /** `userId` : la préférence de modèle de l'utilisateur (« Choix des modèles ») s'applique, comme
   *  au moment de la génération. `null` si `taskType` n'est pas une tâche IA routable. */
  resolveModel(input: { organizationId: string; taskType: string; userId?: string | undefined }): Promise<RoutedModel | null>;
}

export const ROUTING_MODEL_READER = Symbol("PRICING_ROUTING_MODEL_READER");
