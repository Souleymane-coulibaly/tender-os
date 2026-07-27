import { InvalidLotEstimatedAmountError } from "./errors";

/** Decimal(19,4) côté Prisma : jusqu'à 15 chiffres avant la virgule, 4 après — une valeur hors
 *  de ce format ne doit jamais atteindre Prisma (AUDIT-003 : jamais d'erreur Prisma brute). */
const ESTIMATED_AMOUNT_PATTERN = /^\d{1,15}(\.\d{1,4})?$/;

/**
 * Valide un montant estimatif de lot dans le Domain (AUDIT-003) — la règle s'applique donc quel
 * que soit le point d'entrée (API, futur import DCE, tests), jamais seulement au niveau du
 * schéma HTTP. Rejette tout ce qui n'est pas un nombre décimal strictement positif tenant dans
 * Decimal(19,4).
 */
export function parseEstimatedAmount(value: string): string {
  if (!ESTIMATED_AMOUNT_PATTERN.test(value)) {
    throw new InvalidLotEstimatedAmountError({ value });
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new InvalidLotEstimatedAmountError({ value });
  }

  return value;
}
