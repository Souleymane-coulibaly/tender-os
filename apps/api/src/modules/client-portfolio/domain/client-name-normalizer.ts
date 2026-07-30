/**
 * Normalisation du nom d'un client (mission Sprint 5.1 §"nom normalisé") — même motif que
 * `tag-normalizer.ts` (module Knowledge Base) : seules la casse et les espaces superflus sont
 * normalisés, jamais une réécriture sémantique — garantit "pas de client en doublon" à la casse
 * près au sein d'une même organisation (contrainte unique tenant-aware, migration).
 */
export function normalizeClientAccountName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr-FR");
}
