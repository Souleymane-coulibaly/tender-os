import type { GenerationSummary, PromptTemplateSummary, PromptVersionSummary } from "../../application/dtos";
import type { GenerationCapability } from "../../application/use-cases/get-generation-capabilities.use-case";

export function presentGeneration(generation: GenerationSummary): GenerationSummary {
  return { ...generation };
}

export function presentGenerationCapability(capability: GenerationCapability): GenerationCapability {
  return { ...capability };
}

export function presentPromptTemplate(template: PromptTemplateSummary): PromptTemplateSummary {
  return { ...template };
}

export function presentPromptVersion(version: PromptVersionSummary): PromptVersionSummary {
  return { ...version };
}
