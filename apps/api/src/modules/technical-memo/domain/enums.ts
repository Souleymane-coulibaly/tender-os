export const TechnicalMemoTemplateOrigin = {
  CompanyTemplate: "COMPANY_TEMPLATE",
  DceRequiredTemplate: "DCE_REQUIRED_TEMPLATE",
  TenderOsSystem: "TENDEROS_SYSTEM",
} as const;
export type TechnicalMemoTemplateOrigin = (typeof TechnicalMemoTemplateOrigin)[keyof typeof TechnicalMemoTemplateOrigin];

export const TechnicalMemoStatus = {
  Draft: "DRAFT",
  Ready: "READY",
  Exported: "EXPORTED",
} as const;
export type TechnicalMemoStatus = (typeof TechnicalMemoStatus)[keyof typeof TechnicalMemoStatus];

/** Mission §16 — catalogue fermé, adapté à l'existant. */
export const TechnicalMemoSectionCategory = {
  CompanyPresentation: "COMPANY_PRESENTATION",
  Understanding: "UNDERSTANDING",
  Methodology: "METHODOLOGY",
  Organization: "ORGANIZATION",
  HumanResources: "HUMAN_RESOURCES",
  TechnicalResources: "TECHNICAL_RESOURCES",
  Planning: "PLANNING",
  Quality: "QUALITY",
  Security: "SECURITY",
  Environment: "ENVIRONMENT",
  Csr: "CSR",
  Continuity: "CONTINUITY",
  References: "REFERENCES",
  Innovation: "INNOVATION",
  Governance: "GOVERNANCE",
  Other: "OTHER",
  /** Mission §14 — jamais ignorée silencieusement. */
  NeedsMapping: "NEEDS_MAPPING",
} as const;
export type TechnicalMemoSectionCategory = (typeof TechnicalMemoSectionCategory)[keyof typeof TechnicalMemoSectionCategory];

/** Mission §37. */
export const TechnicalMemoSectionStatus = {
  Empty: "EMPTY",
  ReadyToGenerate: "READY_TO_GENERATE",
  Generating: "GENERATING",
  Draft: "DRAFT",
  NeedsReview: "NEEDS_REVIEW",
  Validated: "VALIDATED",
  Failed: "FAILED",
} as const;
export type TechnicalMemoSectionStatus = (typeof TechnicalMemoSectionStatus)[keyof typeof TechnicalMemoSectionStatus];

export const TechnicalMemoSectionRevisionSource = {
  AiGenerated: "AI_GENERATED",
  Manual: "MANUAL",
  AiRegenerated: "AI_REGENERATED",
} as const;
export type TechnicalMemoSectionRevisionSource = (typeof TechnicalMemoSectionRevisionSource)[keyof typeof TechnicalMemoSectionRevisionSource];

export const TechnicalMemoCitationSourceType = {
  Finding: "FINDING",
  KnowledgeEntry: "KNOWLEDGE_ENTRY",
  CandidateField: "CANDIDATE_FIELD",
  Reference: "REFERENCE",
  DceChunk: "DCE_CHUNK",
} as const;
export type TechnicalMemoCitationSourceType = (typeof TechnicalMemoCitationSourceType)[keyof typeof TechnicalMemoCitationSourceType];

/** Sous-ensemble des 6 types de Finding (Analysis, Sprint 4) pertinents pour une couverture de
 *  mémoire rédactionnel — RISK/DEADLINE/QUESTION ne sont jamais "couverts" par une section. */
export const TechnicalMemoRequirementFindingType = {
  Requirement: "REQUIREMENT",
  Criterion: "CRITERION",
  Clause: "CLAUSE",
} as const;
export type TechnicalMemoRequirementFindingType = (typeof TechnicalMemoRequirementFindingType)[keyof typeof TechnicalMemoRequirementFindingType];

/** Mission §45. */
export const TechnicalMemoCoverageStatus = {
  Covered: "COVERED",
  PartiallyCovered: "PARTIALLY_COVERED",
  NotCovered: "NOT_COVERED",
  NotApplicable: "NOT_APPLICABLE",
  NeedsReview: "NEEDS_REVIEW",
} as const;
export type TechnicalMemoCoverageStatus = (typeof TechnicalMemoCoverageStatus)[keyof typeof TechnicalMemoCoverageStatus];
