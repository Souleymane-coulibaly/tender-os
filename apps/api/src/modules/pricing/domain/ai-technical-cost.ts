import { CostDataStatus } from "./cost-data-status";
import { Money } from "./money.value-object";

/**
 * Coût technique IA d'UNE génération (mission Sprint 7 §"Coût technique IA" — "montant directement
 * lié à l'utilisation du modèle IA"). Objet de VALEUR pur, jamais persisté tel quel : la donnée
 * source de vérité reste `Generation.estimatedCostAmount`/tokens (Sprint 6, déjà figée au moment de
 * la génération par le correctif P2-3 — pricing snapshot réel, jamais un tarif statique). Ce type
 * encapsule uniquement la LECTURE de cette donnée existante dans le vocabulaire du domaine Pricing,
 * sans jamais la recalculer ni la modifier — voir `toAiTechnicalCost` (application/services).
 */
export type AiTechnicalCost = Readonly<{
  status: CostDataStatus;
  amount?: Money | undefined;
  inputTokenCount?: number | undefined;
  outputTokenCount?: number | undefined;
  totalTokenCount?: number | undefined;
  fallbackLevel?: number | undefined;
  /** Raison lisible quand `status !== CALCULATED` — jamais silencieux (mission §"expliquer la
   *  raison"). */
  reason?: string | undefined;
}>;

export function unknownAiTechnicalCost(reason: string): AiTechnicalCost {
  return { status: CostDataStatus.Unknown, reason };
}
