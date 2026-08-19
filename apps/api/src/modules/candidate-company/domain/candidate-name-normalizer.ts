/**
 * Normalisation du nom d'une entreprise candidate — même motif que
 * `client-portfolio/domain/client-name-normalizer.ts` : seules la casse et les espaces superflus
 * sont normalisés, garantit "pas de doublon" à la casse près au sein d'une même organisation
 * (contrainte unique tenant-aware, migration).
 */
export function normalizeCandidateCompanyName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr-FR");
}
