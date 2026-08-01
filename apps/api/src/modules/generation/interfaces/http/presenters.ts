import type { GenerationSummary, PromptTemplateSummary, PromptVersionSummary } from "../../application/dtos";

export function presentGeneration(generation: GenerationSummary): GenerationSummary {
  return { ...generation };
}

export function presentPromptTemplate(template: PromptTemplateSummary): PromptTemplateSummary {
  return { ...template };
}

export function presentPromptVersion(version: PromptVersionSummary): PromptVersionSummary {
  return { ...version };
}
