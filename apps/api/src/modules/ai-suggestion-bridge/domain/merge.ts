/**
 * V2 Sprint 4 §12 — fusion simple et déterministe, JAMAIS de fusion automatique de texte complexe.
 * Volontairement à deux niveaux : (1) le module cible (chaque adaptateur, voir
 * `application/ports/entity-target-adapter.ts`) déclare PAR NOM DE CHAMP quels champs sont
 * éligibles à la fusion (listes/tags/notes/descriptions simples uniquement — jamais dates,
 * montants, statuts, booléens, SIRET, pondérations, identifiants juridiques, relations métier) ;
 * (2) cette fonction vérifie en plus, à l'exécution, que les deux valeurs ont une FORME
 * compatible. Les deux conditions doivent être réunies avant toute fusion.
 */
export function canMergeByShape(currentValue: unknown, proposedValue: unknown): boolean {
  if (Array.isArray(currentValue) && Array.isArray(proposedValue)) {
    return true;
  }
  if (typeof currentValue === "string" && typeof proposedValue === "string") {
    return true;
  }
  return false;
}

/** N'est jamais appelée sans un `canMergeByShape` préalable — voir ApplyAiSuggestionUseCase. */
export function mergeValues(currentValue: unknown, proposedValue: unknown): unknown {
  if (Array.isArray(currentValue) && Array.isArray(proposedValue)) {
    return [...new Set([...currentValue, ...proposedValue])];
  }
  if (typeof currentValue === "string" && typeof proposedValue === "string") {
    const current = currentValue.trim();
    const proposed = proposedValue.trim();
    if (current === "") return proposedValue;
    if (proposed === "" || current.includes(proposed)) return currentValue;
    return `${currentValue}\n\n${proposedValue}`;
  }
  throw new Error("mergeValues appelée sans vérification préalable de canMergeByShape.");
}
