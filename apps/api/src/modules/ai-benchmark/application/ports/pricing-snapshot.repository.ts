import type { AiModelPricingSnapshot } from "../../domain/pricing-snapshot.entity";

/** Historique de tarifs d'un modèle (Sprint 5.2 §"les tarifs doivent être versionnés ou datés").
 *  `findCurrent` ne retourne jamais qu'AU PLUS une ligne par modèle (contrainte d'unicité partielle
 *  `WHERE effective_to IS NULL` côté Prisma) — `addSnapshot` clôt l'ancienne AVANT de créer la
 *  nouvelle, dans la même transaction courte. */
export interface PricingSnapshotRepository {
  findById(input: { id: string }): Promise<AiModelPricingSnapshot | null>;
  findCurrent(input: { aiModelId: string }): Promise<AiModelPricingSnapshot | null>;
  listByModel(input: { aiModelId: string }): Promise<readonly AiModelPricingSnapshot[]>;
  /** Clôt le snapshot courant (s'il existe) et insère le nouveau, atomiquement. */
  addSnapshot(snapshot: AiModelPricingSnapshot): Promise<void>;
}

export const PRICING_SNAPSHOT_REPOSITORY = Symbol("PRICING_SNAPSHOT_REPOSITORY");
