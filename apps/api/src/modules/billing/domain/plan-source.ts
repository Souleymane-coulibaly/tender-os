import { InvalidPlanSourceError } from "./errors";

/**
 * V2 Sprint 22 (billing, étape 22A) — mission §49 : un abonnement/Pass Platform-Admin-assigné pour
 * un pilote/démo doit rester représentable sans passer par Stripe. `GRANTED` et `MANUAL` sont
 * distincts : `MANUAL` = Platform Admin a saisi un abonnement correspondant à un paiement réel géré
 * hors Stripe (devis Conseil converti, etc.) ; `GRANTED` = accès offert sans contrepartie
 * financière (pilote, démo, partenariat). Les deux exigent un `AuditLog` (22D), jamais une action
 * silencieuse.
 */
export const PlanSource = {
  Stripe: "STRIPE",
  Manual: "MANUAL",
  Granted: "GRANTED",
} as const;

export type PlanSource = (typeof PlanSource)[keyof typeof PlanSource];

export function isPlanSource(value: string): value is PlanSource {
  return Object.values(PlanSource).includes(value as PlanSource);
}

export function parsePlanSource(value: string): PlanSource {
  if (!isPlanSource(value)) {
    throw new InvalidPlanSourceError(value);
  }
  return value;
}
