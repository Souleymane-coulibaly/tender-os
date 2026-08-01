import { Injectable } from "@nestjs/common";
import { PromptVariableMissingError } from "../domain/errors";
import type { PromptVersion } from "../domain/prompt-version.entity";
import type { PromptRenderer, RenderedPrompt } from "../application/ports/prompt-renderer";

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function render(template: string, variables: Readonly<Record<string, string>>): string {
  return template.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
    if (!(name in variables)) {
      throw new PromptVariableMissingError({ placeholder: name });
    }
    return variables[name] ?? "";
  });
}

/**
 * Substitution littérale `{{nom}}` — jamais un moteur de templating tiers, jamais une évaluation de
 * code (mission §"éviter l'injection de structure dans les placeholders"). Un placeholder non
 * résolu échoue explicitement au rendu, jamais un gap silencieux ni une variable arbitraire non
 * fournie par le contexte réellement construit (`generation-context-builder.ts`).
 */
@Injectable()
export class SimplePlaceholderPromptRenderer implements PromptRenderer {
  render(version: PromptVersion, variables: Readonly<Record<string, string>>): RenderedPrompt {
    return {
      systemPrompt: render(version.systemPrompt, variables),
      userPrompt: render(version.userPromptTemplate, variables),
    };
  }
}
