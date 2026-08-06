import { InvalidLotEstimatedAmountError } from "./errors";

/** Decimal(19,4) côté Prisma : jusqu'à 15 chiffres avant la virgule, 4 après — une valeur hors
 *  de ce format ne doit jamais atteindre Prisma (AUDIT-003 : jamais d'erreur Prisma brute). */
const ESTIMATED_AMOUNT_PATTERN = /^\d{1,15}(\.\d{1,4})?$/;

/**
 * Format pur (aucune erreur levée) — réutilisé par Tender (V2 Sprint 3 P1, audit Codex) pour
 * lever sa PROPRE erreur (`InvalidTenderEstimatedAmountError`, jamais celle du lot) tout en
 * partageant exactement la même règle Decimal(19,4) strictement positive.
 */
export function isValidAmountFormat(value: string): boolean {
  if (!ESTIMATED_AMOUNT_PATTERN.test(value)) {
    return false;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0;
}

/**
 * Valide un montant estimatif de lot dans le Domain (AUDIT-003) — la règle s'applique donc quel
 * que soit le point d'entrée (API, futur import DCE, tests), jamais seulement au niveau du
 * schéma HTTP. Rejette tout ce qui n'est pas un nombre décimal strictement positif tenant dans
 * Decimal(19,4).
 */
export function parseEstimatedAmount(value: string): string {
  if (!isValidAmountFormat(value)) {
    throw new InvalidLotEstimatedAmountError({ value });
  }
  return value;
}

/**
 * Règle partagée Tender/TenderLot (audit Codex P1) : minimumAmount ne peut jamais dépasser
 * maximumAmount lorsque les deux sont renseignés. Pure (aucune erreur levée) — chaque agrégat
 * lève sa PROPRE erreur (jamais une erreur "lot" pour un Tender ou inversement).
 */
export function isAmountRangeValid(minimumAmount: string | undefined, maximumAmount: string | undefined): boolean {
  if (minimumAmount === undefined || maximumAmount === undefined) {
    return true;
  }
  return Number(minimumAmount) <= Number(maximumAmount);
}
