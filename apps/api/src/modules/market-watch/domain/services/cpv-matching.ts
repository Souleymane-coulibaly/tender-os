/**
 * Mission §21 — "prévoir éventuellement parent/child matching, ne pas faire uniquement du
 * substring". Décision Sprint 17 (validée) : les codes CPV sont hiérarchiques PAR CONSTRUCTION
 * (8 chiffres, les zéros de fin dénotent "non précisé à ce niveau" — ex. "34000000" = toute la
 * division 34, "34300000" = division 34 + groupe 30). Comparer par PRÉFIXE SIGNIFICATIF (zéros de
 * fin retirés) donne un vrai matching parent/enfant sans importer les ~9500 libellés officiels.
 *
 * Directionnel, volontairement : un SavedSearch sur "34000000" (large) matche un marché
 * "34300000" (plus précis) — mais un SavedSearch sur "34300000" (précis) NE matche PAS un marché
 * "34000000" (générique/non précisé) : on ne suppose jamais une spécificité que la source ne
 * déclare pas (même principe "exclure en cas d'incertitude" que le narrowing client Sprint 16).
 */
export function significantCpvPrefix(cpvCode: string): string {
  const digitsOnly = cpvCode.trim().split("-")[0] ?? "";
  return digitsOnly.replace(/0+$/, "");
}

export function cpvMatches(savedSearchCpv: string, tenderCpv: string): boolean {
  const prefix = significantCpvPrefix(savedSearchCpv);
  if (prefix.length === 0) return false;
  const tenderDigits = tenderCpv.trim().split("-")[0] ?? "";
  return tenderDigits.startsWith(prefix);
}

/** Vrai si AU MOINS UN des CPV du marché correspond à AU MOINS UN des CPV recherchés. */
export function anyCpvMatches(savedSearchCpvCodes: readonly string[], tenderCpvCodes: readonly string[]): boolean {
  if (savedSearchCpvCodes.length === 0) return true;
  return savedSearchCpvCodes.some((searchCpv) => tenderCpvCodes.some((tenderCpv) => cpvMatches(searchCpv, tenderCpv)));
}
