import { InvalidOpportunityEstimatedAmountError } from "./errors";

/** Decimal(19,4) côté Prisma (même règle que `tenders/domain/estimated-amount.ts` — copie locale
 *  volontaire, jamais un import profond inter-module, mission "aucun import profond"). */
const ESTIMATED_AMOUNT_PATTERN = /^\d{1,15}(\.\d{1,4})?$/;

export function isValidAmountFormat(value: string): boolean {
  if (!ESTIMATED_AMOUNT_PATTERN.test(value)) {
    return false;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

export function parseEstimatedAmount(value: string): string {
  if (!isValidAmountFormat(value)) {
    throw new InvalidOpportunityEstimatedAmountError({ value });
  }
  return value;
}
