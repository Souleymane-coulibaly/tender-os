/**
 * Normalisation d'un libellé de tag (mission Sprint 5 §4 "Tags") — garantit "pas de doublons liés
 * à la casse" : seule la casse et les espaces superflus sont normalisés, jamais une réécriture
 * sémantique (un tag saisi "ISO-27001" ou "iso-27001" doit être LE MÊME tag ; "secteur-public" et
 * "secteur public" restent volontairement deux tags distincts — aucune règle mission ne demande
 * cette équivalence, une normalisation plus agressive serait une sur-conception non demandée).
 */
export function normalizeTagLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr-FR");
}

export function isValidTagLabel(label: string): boolean {
  const normalized = normalizeTagLabel(label);
  return normalized.length > 0 && normalized.length <= 60;
}
