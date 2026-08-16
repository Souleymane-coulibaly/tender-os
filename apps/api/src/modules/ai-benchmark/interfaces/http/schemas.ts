import { z } from "zod";
import { AI_TASK_TYPES } from "../../../../shared-kernel/ai-task-type";

export const IdParamSchema = z.string().uuid();

const CapabilitiesSchema = z
  .object({
    supportsStructuredOutput: z.boolean(),
    supportsToolCalling: z.boolean(),
    supportsVision: z.boolean(),
  })
  .strict();

export const CreateAiModelBodySchema = z
  .object({
    provider: z.string().min(1).max(30),
    modelKey: z.string().min(1).max(60),
    displayName: z.string().min(1).max(200),
    capabilities: CapabilitiesSchema.optional(),
    maxContextTokens: z.number().int().positive().optional(),
    enabledForBenchmark: z.boolean().optional(),
    enabledForProduction: z.boolean().optional(),
  })
  .strict();
export type CreateAiModelBody = z.infer<typeof CreateAiModelBodySchema>;

export const UpdateAiModelBodySchema = z
  .object({
    displayName: z.string().min(1).max(200).optional(),
    capabilities: CapabilitiesSchema.optional(),
    maxContextTokens: z.number().int().positive().optional(),
    enabledForBenchmark: z.boolean().optional(),
    enabledForProduction: z.boolean().optional(),
  })
  .strict();
export type UpdateAiModelBody = z.infer<typeof UpdateAiModelBodySchema>;

export const ListAiModelsQuerySchema = z
  .object({
    enabledForBenchmark: z.coerce.boolean().optional(),
    enabledForProduction: z.coerce.boolean().optional(),
  })
  .strict();
export type ListAiModelsQuery = z.infer<typeof ListAiModelsQuerySchema>;

export const AddPricingSnapshotBodySchema = z
  .object({
    inputPricePerMillionTokens: z.string().regex(/^\d+(\.\d+)?$/),
    outputPricePerMillionTokens: z.string().regex(/^\d+(\.\d+)?$/),
    currency: z.string().length(3),
  })
  .strict();
export type AddPricingSnapshotBody = z.infer<typeof AddPricingSnapshotBodySchema>;

const PROMPT_KEYS = ["ANALYZE_DOCUMENT", "CONSOLIDATE_TENDER_ANALYSIS"] as const;

export const CreateBenchmarkSuiteBodySchema = z
  .object({
    name: z.string().min(1).max(200),
    promptKey: z.enum(PROMPT_KEYS),
    description: z.string().max(2000).optional(),
  })
  .strict();
export type CreateBenchmarkSuiteBody = z.infer<typeof CreateBenchmarkSuiteBodySchema>;

export const EstimateBenchmarkRunCostBodySchema = z
  .object({
    suiteId: z.string().uuid(),
    modelIds: z.array(z.string().uuid()).min(1).max(10),
    repetitions: z.number().int().min(1).max(5),
  })
  .strict();
export type EstimateBenchmarkRunCostBody = z.infer<typeof EstimateBenchmarkRunCostBodySchema>;

export const LaunchBenchmarkRunBodySchema = z
  .object({
    suiteId: z.string().uuid(),
    modelIds: z.array(z.string().uuid()).min(1).max(10),
    repetitions: z.number().int().min(1).max(5),
    concurrencyLimit: z.number().int().min(1).max(5),
    costCeilingAmount: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  })
  .strict();
export type LaunchBenchmarkRunBody = z.infer<typeof LaunchBenchmarkRunBodySchema>;

export const GenerateModelRecommendationBodySchema = z.object({ runId: z.string().uuid() }).strict();
export type GenerateModelRecommendationBody = z.infer<typeof GenerateModelRecommendationBodySchema>;

const ESCALATION_CONDITIONS = [
  "INVALID_JSON",
  "UNKNOWN_SOURCE",
  "CITATION_NOT_FOUND",
  "LOW_CONFIDENCE",
  "INCOMPLETE_RESULT",
  "PROVIDER_ERROR",
  "TIMEOUT",
] as const;

/** Consolidation IA — Checkpoint A (Foundation) : liste DÉLIBÉRÉMENT SÉPARÉE de `PROMPT_KEYS` (qui
 *  reste réservée à `CreateBenchmarkSuiteBodySchema`, hors périmètre de ce checkpoint — voir
 *  Checkpoint C pour l'élargissement de la couverture benchmark). Reprend désormais `AI_TASK_TYPES`
 *  (`shared-kernel/ai-task-type.ts`), la source de vérité unique des task types routables — élimine
 *  la resynchronisation manuelle qui existait ici (les 19 valeurs Analyse+Génération + les 2
 *  nouvelles, `CHAT`/`TECHNICAL_MEMO_SECTION`), sans réintroduire la dépendance `ai-benchmark →
 *  generation` que l'ancienne duplication évitait : `shared-kernel` n'a par construction aucun
 *  consommateur qui la consommerait en retour.
 */
const ROUTABLE_TASK_KEYS = AI_TASK_TYPES;

export const CreateRoutingPolicyBodySchema = z
  .object({
    promptKey: z.enum(ROUTABLE_TASK_KEYS),
    primaryAiModelId: z.string().uuid(),
    escalationAiModelId: z.string().uuid().optional(),
    confidenceThreshold: z.number().min(0).max(1).optional(),
    provenanceRequired: z.boolean().optional(),
    timeoutMs: z.number().int().positive().max(120000),
    maxRetries: z.number().int().min(0).max(5),
    escalationConditions: z.array(z.enum(ESCALATION_CONDITIONS)).default([]),
    sourceRecommendationId: z.string().uuid().optional(),
  })
  .strict();
export type CreateRoutingPolicyBody = z.infer<typeof CreateRoutingPolicyBodySchema>;

export const AddBenchmarkCaseBodySchema = z
  .object({
    inputVariables: z.record(z.string(), z.string()),
    expectedOutput: z.unknown(),
    expectedProvenance: z.unknown().optional(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
    language: z.enum(["FR", "EN"]),
    businessCategory: z
      .enum(["METADATA", "DEADLINE", "CRITERIA", "REQUIREMENT", "CLAUSE", "RISK", "QUESTION", "CONTRADICTION", "SUMMARY"])
      .optional(),
  })
  .strict();
export type AddBenchmarkCaseBody = z.infer<typeof AddBenchmarkCaseBodySchema>;
