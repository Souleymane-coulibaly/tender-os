/**
 * Mission V2 Sprint 2 §4.1 — "valider les formats SIREN, SIRET et TVA" sans jamais bloquer une
 * fiche incomplète : ces fonctions ne rejettent qu'une valeur FOURNIE et structurellement
 * invalide (Luhn/clé de contrôle) — un champ absent reste toujours accepté (nullable en base,
 * validation Zod `.optional()` côté DTO).
 */

function luhnChecksumValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** SIREN — 9 chiffres, clé de Luhn valide. */
export function isValidSiren(value: string): boolean {
  return /^\d{9}$/.test(value) && luhnChecksumValid(value);
}

/** SIRET — 14 chiffres (SIREN + NIC), clé de Luhn valide sur l'ensemble des 14 chiffres. */
export function isValidSiret(value: string): boolean {
  return /^\d{14}$/.test(value) && luhnChecksumValid(value);
}

/** TVA intracommunautaire FR — "FR" + 2 chiffres de clé + SIREN (9 chiffres), clé =
 *  (12 + 3 * (SIREN mod 97)) mod 97. Formats étrangers (hors FR) acceptés sans validation de clé
 *  — mission §4.1 couvre uniquement le format national, une entreprise étrangère reste possible. */
export function isValidFrenchVatNumber(value: string): boolean {
  const match = /^FR(\d{2})(\d{9})$/.exec(value.replace(/\s/g, "").toUpperCase());
  if (!match) {
    return false;
  }
  const [, key, siren] = match;
  if (!key || !siren) return false;
  const expectedKey = (12 + 3 * (Number(siren) % 97)) % 97;
  return Number(key) === expectedKey;
}
