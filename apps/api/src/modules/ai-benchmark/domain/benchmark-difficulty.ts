export const BenchmarkDifficulty = {
  Easy: "EASY",
  Medium: "MEDIUM",
  Hard: "HARD",
} as const;

export type BenchmarkDifficulty = (typeof BenchmarkDifficulty)[keyof typeof BenchmarkDifficulty];

export const BenchmarkLanguage = {
  French: "FR",
  English: "EN",
} as const;

export type BenchmarkLanguage = (typeof BenchmarkLanguage)[keyof typeof BenchmarkLanguage];

/** Étiquette de reporting purement descriptive (Sprint 5.2 — décision de granularité de routing :
 *  le dispatch réel reste au niveau PromptKey, jamais ici) — sert uniquement à comparer les
 *  modèles sur une catégorie métier dans l'UI de comparaison, jamais un second point de dispatch. */
export const BenchmarkBusinessCategory = {
  Metadata: "METADATA",
  Deadline: "DEADLINE",
  Criteria: "CRITERIA",
  Requirement: "REQUIREMENT",
  Clause: "CLAUSE",
  Risk: "RISK",
  Question: "QUESTION",
  Contradiction: "CONTRADICTION",
  Summary: "SUMMARY",
} as const;

export type BenchmarkBusinessCategory = (typeof BenchmarkBusinessCategory)[keyof typeof BenchmarkBusinessCategory];
