/** Priorité d'une question à poser à l'acheteur (mission Sprint 4.2 §7). */
export const QuestionPriority = {
  Low: "LOW",
  Medium: "MEDIUM",
  High: "HIGH",
} as const;

export type QuestionPriority = (typeof QuestionPriority)[keyof typeof QuestionPriority];

export function isQuestionPriority(value: string): value is QuestionPriority {
  return Object.values(QuestionPriority).includes(value as QuestionPriority);
}
