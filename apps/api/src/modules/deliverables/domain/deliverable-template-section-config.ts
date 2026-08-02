import { InvalidDeliverableTemplateConfigError } from "./errors";
import { isTemplateSectionRequirement, TemplateSectionRequirement } from "./template-section-requirement";

export type DeliverableTemplateSectionConfig = Readonly<{
  code: string;
  title: string;
  description?: string | undefined;
  order: number;
  headingLevel: 1 | 2 | 3;
  requirement: TemplateSectionRequirement;
  displayCondition?: string | undefined;
  recommendedLength?: number | undefined;
  maxCharacters?: number | undefined;
  maxPages?: number | undefined;
  instructions?: string | undefined;
  styleHint?: string | undefined;
  /** Mission §7 — le type de tâche IA à utiliser pour générer cette section (réutilise le
   *  catalogue `GenerationTaskType` de Sprint 6, jamais un second catalogue). */
  taskType?: string | undefined;
  allowedVariables: readonly string[];
  validationRequired: boolean;
  pageBreakBefore: boolean;
}>;

const MAX_SECTIONS = 100;
const MAX_TEXT_LENGTH = 500;
const MAX_LONG_TEXT_LENGTH = 5000;
const CODE_PATTERN = /^[A-Z0-9_]{1,80}$/;

/**
 * Mission Sprint 8A.1 §5 — "conserve : code, titre, description, ordre, niveau H1/H2/H3,
 * obligatoire, condition d'affichage, longueur recommandée, limite caractères/pages, instructions
 * rédactionnelles, taskType IA, prompt métier associé, variables autorisées, validation requise,
 * style, sauts de page." Le "prompt métier associé" lui-même reste dans Generation (Sprint 6, via
 * `taskType` → prompt actif) — jamais un second stockage de prompt ici (mission §7 "ne recode pas
 * un nouveau moteur IA").
 */
export function validateDeliverableTemplateSections(input: unknown): DeliverableTemplateSectionConfig[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new InvalidDeliverableTemplateConfigError("sections must be a non-empty array");
  }
  if (input.length > MAX_SECTIONS) {
    throw new InvalidDeliverableTemplateConfigError(`sections must not exceed ${MAX_SECTIONS} entries`);
  }
  const seenCodes = new Set<string>();
  return input.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new InvalidDeliverableTemplateConfigError(`sections[${index}] must be an object`);
    }
    const section = entry as Record<string, unknown>;
    if (typeof section.code !== "string" || !CODE_PATTERN.test(section.code)) {
      throw new InvalidDeliverableTemplateConfigError(`sections[${index}].code must be an uppercase identifier (letters, digits, underscore)`);
    }
    if (seenCodes.has(section.code)) {
      throw new InvalidDeliverableTemplateConfigError(`duplicate section code "${section.code}"`);
    }
    seenCodes.add(section.code);
    if (typeof section.title !== "string" || !section.title.trim() || section.title.length > MAX_TEXT_LENGTH) {
      throw new InvalidDeliverableTemplateConfigError(`sections[${index}].title is invalid`);
    }
    if (typeof section.order !== "number" || !Number.isInteger(section.order) || section.order < 0) {
      throw new InvalidDeliverableTemplateConfigError(`sections[${index}].order must be a non-negative integer`);
    }
    if (section.headingLevel !== 1 && section.headingLevel !== 2 && section.headingLevel !== 3) {
      throw new InvalidDeliverableTemplateConfigError(`sections[${index}].headingLevel must be 1, 2 or 3`);
    }
    const requirement = typeof section.requirement === "string" ? section.requirement : TemplateSectionRequirement.Optional;
    if (!isTemplateSectionRequirement(requirement)) {
      throw new InvalidDeliverableTemplateConfigError(`sections[${index}].requirement is invalid`);
    }
    if (section.description !== undefined && (typeof section.description !== "string" || section.description.length > MAX_LONG_TEXT_LENGTH)) {
      throw new InvalidDeliverableTemplateConfigError(`sections[${index}].description is invalid`);
    }
    if (section.instructions !== undefined && (typeof section.instructions !== "string" || section.instructions.length > MAX_LONG_TEXT_LENGTH)) {
      throw new InvalidDeliverableTemplateConfigError(`sections[${index}].instructions is invalid`);
    }
    if (section.recommendedLength !== undefined && (typeof section.recommendedLength !== "number" || section.recommendedLength < 0)) {
      throw new InvalidDeliverableTemplateConfigError(`sections[${index}].recommendedLength must be a non-negative number`);
    }
    if (section.maxCharacters !== undefined && (typeof section.maxCharacters !== "number" || section.maxCharacters < 0)) {
      throw new InvalidDeliverableTemplateConfigError(`sections[${index}].maxCharacters must be a non-negative number`);
    }
    if (section.maxPages !== undefined && (typeof section.maxPages !== "number" || section.maxPages < 0)) {
      throw new InvalidDeliverableTemplateConfigError(`sections[${index}].maxPages must be a non-negative number`);
    }
    let allowedVariables: readonly string[] = [];
    if (section.allowedVariables !== undefined) {
      if (!Array.isArray(section.allowedVariables) || !section.allowedVariables.every((v) => typeof v === "string")) {
        throw new InvalidDeliverableTemplateConfigError(`sections[${index}].allowedVariables must be an array of strings`);
      }
      allowedVariables = section.allowedVariables;
    }
    return {
      code: section.code,
      title: section.title,
      description: section.description as string | undefined,
      order: section.order,
      headingLevel: section.headingLevel,
      requirement,
      displayCondition: section.displayCondition as string | undefined,
      recommendedLength: section.recommendedLength as number | undefined,
      maxCharacters: section.maxCharacters as number | undefined,
      maxPages: section.maxPages as number | undefined,
      instructions: section.instructions as string | undefined,
      styleHint: section.styleHint as string | undefined,
      taskType: section.taskType as string | undefined,
      allowedVariables,
      validationRequired: section.validationRequired !== false,
      pageBreakBefore: section.pageBreakBefore === true,
    };
  });
}
