import { InvalidBillingIntervalError } from "./errors";

/**
 * V2 Sprint 22 (billing, étape 22A) — mission §17 : la facturation annuelle paie 11 mois d'un coup
 * (`monthlyPriceCents * 11`, voir plan-catalog.ts) mais les crédits AO restent accordés MOIS PAR
 * MOIS (22B) — `BillingInterval` ne code que le rythme de facturation, jamais celui des crédits.
 * N/A pour PASS (paiement unique, jamais un `BillingInterval`).
 */
export const BillingInterval = {
  Monthly: "MONTHLY",
  Yearly: "YEARLY",
} as const;

export type BillingInterval = (typeof BillingInterval)[keyof typeof BillingInterval];

export function isBillingInterval(value: string): value is BillingInterval {
  return Object.values(BillingInterval).includes(value as BillingInterval);
}

export function parseBillingInterval(value: string): BillingInterval {
  if (!isBillingInterval(value)) {
    throw new InvalidBillingIntervalError(value);
  }
  return value;
}
