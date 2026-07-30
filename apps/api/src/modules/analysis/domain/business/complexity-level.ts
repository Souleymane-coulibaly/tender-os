/** Niveau de complexité estimé de la synthèse métier (mission Sprint 4.2 §8). */
export const ComplexityLevel = {
  Low: "LOW",
  Medium: "MEDIUM",
  High: "HIGH",
} as const;

export type ComplexityLevel = (typeof ComplexityLevel)[keyof typeof ComplexityLevel];

export function isComplexityLevel(value: string): value is ComplexityLevel {
  return Object.values(ComplexityLevel).includes(value as ComplexityLevel);
}
