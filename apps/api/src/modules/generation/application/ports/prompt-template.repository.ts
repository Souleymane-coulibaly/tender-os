import type { PromptTemplate } from "../../domain/prompt-template.aggregate";
import type { GenerationTaskType } from "../../domain/generation-task-type";

export interface PromptTemplateRepository {
  findById(input: { organizationId: string; templateId: string }): Promise<PromptTemplate | null>;
  findByTaskType(input: { organizationId: string; taskType: GenerationTaskType }): Promise<PromptTemplate | null>;
  list(input: { organizationId: string; includeArchived: boolean }): Promise<readonly PromptTemplate[]>;
  create(template: PromptTemplate): Promise<void>;
  save(template: PromptTemplate): Promise<void>;
}

export const PROMPT_TEMPLATE_REPOSITORY = Symbol("GENERATION_PROMPT_TEMPLATE_REPOSITORY");
