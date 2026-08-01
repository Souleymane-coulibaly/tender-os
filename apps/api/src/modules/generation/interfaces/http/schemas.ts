import { z } from "zod";
import { GenerationOutputMode } from "../../domain/generation-output-mode";
import { GenerationTaskType } from "../../domain/generation-task-type";

export const IdParamSchema = z.string().uuid();

const TaskTypeSchema = z.enum(Object.values(GenerationTaskType) as [string, ...string[]]);
const OutputModeSchema = z.enum(Object.values(GenerationOutputMode) as [string, ...string[]]);

export const LaunchGenerationBodySchema = z
  .object({
    taskType: TaskTypeSchema,
    targetRef: z.string().min(1).max(200).optional(),
  })
  .strict();
export type LaunchGenerationBody = z.infer<typeof LaunchGenerationBodySchema>;

export const EditGenerationBodySchema = z
  .object({
    editedContent: z.string().min(1).optional(),
    editedStructuredContent: z.unknown().optional(),
  })
  .strict();
export type EditGenerationBody = z.infer<typeof EditGenerationBodySchema>;

/** Réaudit Codex P1 — "le rejet d'une génération est absent". `reason` optionnelle, jamais
 *  obligatoire (mission "conserver ... la raison de rejet SI le modèle métier le prévoit" — le
 *  modèle la prévoit mais ne l'exige pas). */
export const RejectGenerationBodySchema = z
  .object({
    reason: z.string().min(1).max(1000).optional(),
  })
  .strict();
export type RejectGenerationBody = z.infer<typeof RejectGenerationBodySchema>;

export const ListTenderGenerationsQuerySchema = z
  .object({
    taskType: TaskTypeSchema.optional(),
    limit: z.coerce.number().int().positive().max(100).default(20),
    offset: z.coerce.number().int().nonnegative().default(0),
  })
  .strict();
export type ListTenderGenerationsQuery = z.infer<typeof ListTenderGenerationsQuerySchema>;

export const CompareGenerationsQuerySchema = z
  .object({
    fromId: z.string().uuid(),
    toId: z.string().uuid(),
  })
  .strict();
export type CompareGenerationsQuery = z.infer<typeof CompareGenerationsQuerySchema>;

export const CreatePromptTemplateBodySchema = z
  .object({
    taskType: TaskTypeSchema,
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    outputMode: OutputModeSchema,
    structuredSchemaKey: z.string().min(1).max(60).optional(),
  })
  .strict();
export type CreatePromptTemplateBody = z.infer<typeof CreatePromptTemplateBodySchema>;

export const CreatePromptVersionBodySchema = z
  .object({
    systemPrompt: z.string().min(1),
    userPromptTemplate: z.string().min(1),
    requiredVariables: z.array(z.string().min(1)).default([]),
  })
  .strict();
export type CreatePromptVersionBody = z.infer<typeof CreatePromptVersionBodySchema>;

export const ListPromptTemplatesQuerySchema = z
  .object({
    includeArchived: z.coerce.boolean().optional(),
  })
  .strict();
export type ListPromptTemplatesQuery = z.infer<typeof ListPromptTemplatesQuerySchema>;
