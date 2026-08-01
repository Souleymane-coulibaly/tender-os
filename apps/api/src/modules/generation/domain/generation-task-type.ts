import { InvalidGenerationTaskTypeError } from "./errors";

/**
 * Catalogue fermé des types de tâche de génération (mission Sprint 6 §"Types de génération") —
 * 17 valeurs. Extensible par migration (ajout d'une valeur au CHECK + ici), jamais par une branche
 * if/else par type dans le code applicatif : le contenu spécifique à chaque type vit dans le
 * `PromptTemplate`/`PromptVersion` correspondant (donnée), pas dans la logique (voir
 * `generation-context-builder.ts`, qui reste un assembleur générique unique).
 */
export const GenerationTaskType = {
  ExecutiveSummary: "EXECUTIVE_SUMMARY",
  NeedUnderstanding: "NEED_UNDERSTANDING",
  CriterionResponse: "CRITERION_RESPONSE",
  Methodology: "METHODOLOGY",
  Organization: "ORGANIZATION",
  Governance: "GOVERNANCE",
  HumanResources: "HUMAN_RESOURCES",
  TechnicalResources: "TECHNICAL_RESOURCES",
  Planning: "PLANNING",
  RiskManagement: "RISK_MANAGEMENT",
  Quality: "QUALITY",
  Security: "SECURITY",
  Csr: "CSR",
  References: "REFERENCES",
  SectionSummary: "SECTION_SUMMARY",
  Rephrasing: "REPHRASING",
  ContentImprovement: "CONTENT_IMPROVEMENT",
} as const;

export type GenerationTaskType = (typeof GenerationTaskType)[keyof typeof GenerationTaskType];

export function isGenerationTaskType(value: string): value is GenerationTaskType {
  return Object.values(GenerationTaskType).includes(value as GenerationTaskType);
}

export function parseGenerationTaskType(value: string): GenerationTaskType {
  if (!isGenerationTaskType(value)) {
    throw new InvalidGenerationTaskTypeError(value);
  }
  return value;
}
