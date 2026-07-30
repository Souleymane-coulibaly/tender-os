import { Injectable } from "@nestjs/common";
import {
  CURRENT_PROMPT_VERSION,
  PromptKey,
  type PromptTemplatePort,
  type PromptVariables,
  type RenderedPrompt,
} from "../application/ports/prompt-template.port";

/**
 * Stockage statique/applicatif (mission §"Prompts" — "aucun écran d'administration, aucune édition
 * dynamique, aucune base de données dédiée sauf nécessité clairement démontrée"). Un seul template,
 * purement technique (mission §"Sortie du provider pour le Sprint 4.1" — le résultat peut rester
 * volontairement technique) : ne contient AUCUN prompt métier d'analyse RC/CCTP/CCAP/AE.
 */
const TEMPLATES: Record<PromptKey, RenderedPrompt> = {
  [PromptKey.TechnicalValidationPlaceholder]: {
    version: CURRENT_PROMPT_VERSION,
    systemPrompt:
      "You are validating the TenderOS Sprint 4.1 AI analysis pipeline foundation. This is a " +
      "purely technical smoke test, not a business document analysis. Respond ONLY with strict " +
      'JSON matching this shape: {"output":{"summary":"<a short technical acknowledgement, at ' +
      'most 200 characters>"}}. Do not include any other field, markdown, or commentary.',
    userPrompt: "Confirm the pipeline is operational by returning the required JSON object.",
  },
};

@Injectable()
export class StaticPromptTemplateProvider implements PromptTemplatePort {
  render(key: PromptKey, _variables: PromptVariables): RenderedPrompt {
    return TEMPLATES[key];
  }
}
