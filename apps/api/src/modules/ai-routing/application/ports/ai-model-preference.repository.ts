import type { AiTaskType } from "../../../../shared-kernel/ai-task-type";
import type { AiRoutingModel } from "../../domain/ai-routing-model";

export type AiModelPreferenceRecord = Readonly<{
  id: string;
  userId: string;
  organizationId: string;
  taskType: AiTaskType;
  modelOverride: AiRoutingModel;
  createdAt: Date;
  updatedAt: Date;
}>;

export interface AiModelPreferenceRepository {
  findOne(input: { userId: string; organizationId: string; taskType: AiTaskType }): Promise<AiModelPreferenceRecord | null>;
  listByUser(input: { userId: string; organizationId: string }): Promise<AiModelPreferenceRecord[]>;
  /** Mission §10 — "AUTO" n'est jamais une valeur stockée : `set` ne reçoit qu'un `AiRoutingModel`
   *  réel, jamais un troisième cas "automatique" à distinguer. */
  set(input: { id: string; userId: string; organizationId: string; taskType: AiTaskType; modelOverride: AiRoutingModel; occurredAt: Date }): Promise<void>;
  /** Reset vers AUTOMATIC = suppression de la ligne (mission §10) — jamais une mise à jour vers une
   *  valeur "AUTO". Idempotent : aucune erreur si la ligne n'existait déjà pas. */
  reset(input: { userId: string; organizationId: string; taskType: AiTaskType }): Promise<void>;
}

export const AI_MODEL_PREFERENCE_REPOSITORY = Symbol("AI_MODEL_PREFERENCE_REPOSITORY");
