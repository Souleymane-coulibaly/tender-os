import { z } from "zod";
import { AI_TASK_TYPES } from "../../../../shared-kernel/ai-task-type";
import { AiRoutingModel } from "../../domain/ai-routing-model";

export const TaskTypeParamSchema = z.enum(AI_TASK_TYPES);

export const SetPreferenceBodySchema = z
  .object({ modelOverride: z.enum([AiRoutingModel.Gpt54Mini, AiRoutingModel.Gpt54Nano]) })
  .strict();
export type SetPreferenceBody = z.infer<typeof SetPreferenceBodySchema>;
