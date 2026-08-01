/**
 * Port PROPRE à Pricing — jamais un import direct des ports internes de `generation` (créerait une
 * dépendance non nécessaire ; Pricing ne fait que LIRE des colonnes déjà publiques au niveau du
 * schéma Prisma partagé, même motif que `PrismaRoutingDecisionWriter` lisant `Tender.clientAccountId`
 * directement, Sprint 5.2). Lit le coût technique déjà figé par Sprint 6 (correctif P2-3) sur
 * `Generation.estimatedCostAmount`/tokens — Pricing ne RECALCULE jamais ce montant, il le lit et le
 * présente dans son propre vocabulaire (`AiTechnicalCost`).
 */
export type GenerationCostRow = Readonly<{
  generationId: string;
  clientAccountId: string;
  tenderId: string;
  taskType: string;
  /** Statut Generation (PENDING/GENERATING/GENERATED/FAILED/CANCELLED) — jamais réinterprété ici,
   *  uniquement utilisé pour distinguer "pas encore de coût" d'un "coût réellement inconnu". */
  status: string;
  modelProvider?: string | undefined;
  modelKey?: string | undefined;
  fallbackLevel?: number | undefined;
  inputTokenCount?: number | undefined;
  outputTokenCount?: number | undefined;
  totalTokenCount?: number | undefined;
  costAmount?: string | undefined;
  currency?: string | undefined;
  createdAt: Date;
  completedAt?: Date | undefined;
}>;

export type GenerationCostFilter = Readonly<{
  organizationId: string;
  tenderId?: string | undefined;
  clientAccountId?: string | undefined;
  taskType?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}>;

export type GenerationCostListResult = Readonly<{ items: readonly GenerationCostRow[]; total: number }>;

export interface GenerationCostReader {
  list(filter: GenerationCostFilter): Promise<GenerationCostListResult>;
  findById(input: { organizationId: string; generationId: string }): Promise<GenerationCostRow | null>;
  /** Moyenne historique de tokens pour un taskType donné — utilisée UNIQUEMENT comme valeur par
   *  défaut explicite d'une prévision (mission §"le système peut utiliser... une moyenne par
   *  taskType"), jamais présentée comme une donnée certaine. `null` si aucun historique. */
  averageTokensForTaskType(input: {
    organizationId: string;
    taskType: string;
  }): Promise<{ averageInputTokens: number; averageOutputTokens: number; sampleSize: number } | null>;
}

export const GENERATION_COST_READER = Symbol("PRICING_GENERATION_COST_READER");
