/** Gravité d'un risque détecté par l'IA (mission Sprint 4.2 §6 "Risques"). */
export const RiskSeverity = {
  Low: "LOW",
  Medium: "MEDIUM",
  High: "HIGH",
  Critical: "CRITICAL",
} as const;

export type RiskSeverity = (typeof RiskSeverity)[keyof typeof RiskSeverity];

export function isRiskSeverity(value: string): value is RiskSeverity {
  return Object.values(RiskSeverity).includes(value as RiskSeverity);
}
