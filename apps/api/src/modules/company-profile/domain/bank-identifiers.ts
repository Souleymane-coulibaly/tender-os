/**
 * Checkpoint TENDEROS-2.1-CCV2-C.1 — validation des identifiants bancaires.
 *
 * AUCUN validateur IBAN/BIC n'existait dans le dépôt avant ce checkpoint : le schéma Zod Legacy se
 * limite à `z.string().min(1).max(34)`, ce qui accepte n'importe quelle chaîne. Ces fonctions ne
 * REMPLACENT donc aucune validation métier existante — elles comblent une absence.
 *
 * MULTI-PAYS PAR CONSTRUCTION (mission §12) : l'algorithme est la norme ISO 13616 (contrôle mod-97
 * sur l'IBAN réarrangé), valable pour tous les pays émetteurs, jamais une regex française. Aucune
 * liste de longueurs par pays n'est codée en dur : elle deviendrait fausse au premier pays ajouté
 * ou modifié par le registre SWIFT, alors que le mod-97 reste vrai indéfiniment. Le compromis est
 * assumé et explicite : un IBAN d'un pays inconnu dont la clé est correcte est accepté ; un IBAN
 * dont la clé est fausse est toujours rejeté.
 *
 * Le BIC suit ISO 9362 : 8 caractères (banque + pays + localité) ou 11 (avec branche).
 */

const IBAN_STRUCTURE = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;
const BIC_STRUCTURE = /^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/;

/** Normalisation canonique : les espaces de présentation d'un IBAN (groupes de 4) ne font pas
 *  partie de l'identifiant, et la casse n'est pas significative. */
export function normalizeIban(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function normalizeBic(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/** Contrôle ISO 13616 : déplacer les 4 premiers caractères en fin, convertir chaque lettre en
 *  nombre (A=10 … Z=35), le reste de la division par 97 doit valoir 1. Le calcul est effectué par
 *  morceaux pour rester exact au-delà de `Number.MAX_SAFE_INTEGER` (un IBAN converti dépasse
 *  largement 2^53), sans dépendre de BigInt. */
export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!IBAN_STRUCTURE.test(iban)) {
    return false;
  }

  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  let remainder = 0;
  for (const character of rearranged) {
    const converted = character >= "A" && character <= "Z" ? `${character.charCodeAt(0) - 55}` : character;
    for (const digit of converted) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

export function isValidBic(value: string): boolean {
  return BIC_STRUCTURE.test(normalizeBic(value));
}

/**
 * Masquage d'affichage — ne conserve que les 4 derniers caractères, comme le fait déjà
 * `maskBankAccountForList` côté Legacy (même règle, extraite ici pour être partageable sans
 * dépendre de la couche HTTP).
 */
export function maskIban(iban: string): string {
  if (iban.length <= 4) {
    return "•".repeat(iban.length);
  }
  return `${"•".repeat(iban.length - 4)}${iban.slice(-4)}`;
}

/** Les 4 derniers caractères, seule empreinte d'un IBAN autorisée dans un journal d'audit — même
 *  convention que `company_profile.bank_account_added` (`ibanLast4`), jamais l'IBAN complet. */
export function ibanLast4(iban: string): string {
  return iban.slice(-4);
}
